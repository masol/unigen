import { throwNotfound, throwPrecondition } from "$libs/utils/err.js";
import { knowledgeCenter } from "$libs/utils/kc.js";
import matter from "@11ty/gray-matter";
import Logger from "electron-log/main.js";
import fs from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { loadExternalTools } from "./loader.js";
import { buildToolDoc, jsonSchemaToZod } from "./schema.js";
import { scanTemplateVars } from "./template.js";
import type {
    CompileCache, CompiledPacAgent, PacFrontMatter, PacToolConfig, ToolRef,
} from "./type.js";
import { TOOL_DOC_VAR, classifyVars } from "./vars.js";

function sanitizeToolKey(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "_tool";
}

/**
 * 产出一个在 `taken` 中唯一的工具键。
 *
 * 实现要点:
 *  - 冲突时按 `base_2, base_3, ...` 递增扫描,保证**真正**唯一;
 *  - 完全基于入参 `taken`,无模块级状态,幂等且作用域清晰。
 */
function uniqueKey(candidate: string, taken: Set<string>): string {
    const base = sanitizeToolKey(candidate);
    if (!taken.has(base)) return base;

    let n = 2;
    while (taken.has(`${base}_${n}`)) n++;
    const next = `${base}_${n}`;
    Logger.warn(`[PAC] 工具名冲突,重命名为 ${next}`);
    return next;
}

/**
 * PAC 路径解析 —— 语义与代码模块的 import 一致:
 *
 *   "./sub/x.md"  |  "sub/x.md"  |  "../x.md"  → 相对**当前 .md 文件**所在目录
 *   "/sub/x.md"                                 → 相对 **PAC 根目录**(最初的 pac/)
 *   ".md" 后缀可省略
 *
 * 越界检查:无论哪种形式,解析结果都必须仍位于 PAC 根目录内,禁止 ../ 逃逸出根。
 *
 * @param rootPath   PAC 根目录绝对路径(pac/index.md 所在目录)
 * @param currentDir 当前 .md 文件所在目录绝对路径
 * @param p          front matter 中声明的路径
 */
export function resolvePacPath(
    rootPath: string,
    currentDir: string,
    p: string,
): string {
    const rootAnchored = p.startsWith("/") || p.startsWith("\\");
    let abs: string;

    if (rootAnchored) {
        // "/x.md" 这类根相对路径: 相对 PAC 根目录
        const rel = p.replace(/^[\\/]+/, "");
        const withExt = rel.endsWith(".md") ? rel : `${rel}.md`;
        abs = resolve(rootPath, withExt);
    } else {
        // "./x.md" / "x.md" / "../x.md": 相对当前文件所在目录
        const withExt = p.endsWith(".md") ? p : `${p}.md`;
        abs = resolve(currentDir, withExt);
    }

    const relToRoot = relative(rootPath, abs);
    if (relToRoot.startsWith("..") || isAbsolute(relToRoot)) {
        throwPrecondition(`[PAC] 路径越界,不允许逃出 pac 根目录: ${p}`);
    }
    return abs;
}

export function createCompileCache(rootPath: string): CompileCache {
    return {
        compiled: new Map(),
        compiling: new Set(),
        rootPath,
    };
}

async function locateEntry(prjType: string): Promise<{ entry: string; root: string }> {
    const entry = await knowledgeCenter.getFile(prjType, "pac", "index.md");
    if (!entry) {
        throwNotfound(`[PAC] 入口文件未找到: ${prjType}/pac/index.md`);
    }
    return { entry, root: dirname(entry) };
}

/**
 * 递归编译 PAC Agent。
 *
 * 外部一般只传 `prjType` —— 从 KC 定位 `pac/index.md` 作为入口。
 * 内部递归时额外传入 `absPath + cache`,absPath 应已经过 resolvePacPath 解析为绝对路径。
 *
 * - 编译是纯结构构建(含工具加载、schema 转换、变量扫描),与 ctx 无关
 * - cache 保证同一文件只编译一次(树形引用天然去重),并检测循环引用
 */
export async function compilePacAgent(
    prjType: string,
    absPath?: string,
    cache?: CompileCache,
): Promise<CompiledPacAgent> {
    let cc = cache;
    let entry: string;

    if (cc && absPath) {
        // 内部递归分支: 已有缓存与绝对路径
        entry = absPath;
    } else {
        // 顶层入口: 从 KC 定位,顺手创建缓存
        const loc = await locateEntry(prjType);
        entry = absPath ?? loc.entry;
        cc = cache ?? createCompileCache(loc.root);
    }

    const key = resolve(entry);

    const hit = cc.compiled.get(key);
    if (hit) return hit;

    if (cc.compiling.has(key)) {
        throwPrecondition(`[PAC] 检测到循环引用: ${key}`);
    }
    cc.compiling.add(key);

    try {
        const compiled = await compileOne(cc, key);
        cc.compiled.set(key, compiled);
        return compiled;
    } finally {
        cc.compiling.delete(key);
    }
}

async function compileOne(cc: CompileCache, sourcePath: string): Promise<CompiledPacAgent> {
    const raw = await fs.readFile(sourcePath, "utf-8");
    const { data, content: body } = matter(raw);
    const fm = (data ?? {}) as PacFrontMatter;

    let systemTemplate = (body ?? "").trim();
    if (systemTemplate.length === 0) {
        throwPrecondition(`[PAC] 正文(系统提示词)为空: ${sourcePath}`);
    }

    const name = fm.name ?? basename(sourcePath, ".md");
    const description =
        fm.description ?? `PAC agent "${name}" (${relative(cc.rootPath, sourcePath)})`;
    const basePath = dirname(sourcePath);

    Logger.debug(`[PAC] 编译 ${name} ← ${relative(cc.rootPath, sourcePath)}`);

    const inputSchema = jsonSchemaToZod(fm.inputs, "inputs", sourcePath);
    const outputSchema = fm.outputs
        ? jsonSchemaToZod(fm.outputs, "outputs", sourcePath)
        : null;

    // 关键: 把当前文件所在目录传给工具加载,agent 的相对路径即以此为基准
    const toolRefs = await loadToolRefs(fm.tools ?? [], cc, basePath, sourcePath);

    const toolDoc = buildToolDoc(toolRefs);

    let vars = classifyVars(scanTemplateVars(systemTemplate));

    // 仅在**确实存在工具**且模板未显式引用 {{_BI_tool}} 时,才自动追加工具目录。
    // 没有工具时追加会在系统提示词末尾产生一段无意义的 "_当前 agent 未声明任何工具。_",
    // 这不仅是噪声,还会误导 LLM 以为自己应该去找工具。
    if (toolRefs.length > 0 && !vars.bi.includes(TOOL_DOC_VAR)) {
        Logger.debug(`[PAC] ${name}: 正文未引用 {{${TOOL_DOC_VAR}}},自动追加工具目录`);
        systemTemplate = `${systemTemplate}\n\n---\n\n${toolDoc}\n`;
        vars = classifyVars(scanTemplateVars(systemTemplate));
    }

    return {
        name,
        description,
        config: fm,
        systemTemplate,
        userTemplate: fm.userTemplate,
        inputSchema,
        outputSchema,
        toolRefs,
        toolDoc,
        vars,
        basePath,
        rootPath: cc.rootPath,
        sourcePath,
    };
}

async function loadToolRefs(
    configs: PacToolConfig[],
    cc: CompileCache,
    currentDir: string,
    sourcePath: string,
): Promise<ToolRef[]> {
    const refs: ToolRef[] = [];
    const taken = new Set<string>();

    for (const cfg of configs) {
        try {
            if (cfg.type === "agent") {
                // 相对路径以 currentDir 为基准,"/x" 则以 cc.rootPath 为基准
                const subAbsPath = resolvePacPath(cc.rootPath, currentDir, cfg.path);
                const sub = await compilePacAgent("", subAbsPath, cc);
                const key = uniqueKey(cfg.alias ?? sub.name, taken);
                taken.add(key);
                refs.push({
                    key,
                    origin: "agent",
                    tool: null,
                    agent: sub,
                    declaredAs: cfg,
                });
            } else {
                const loaded = await loadExternalTools(cfg);
                for (const [rawKey, tool] of Object.entries(loaded)) {
                    const key = uniqueKey(rawKey, taken);
                    taken.add(key);
                    refs.push({
                        key,
                        origin: cfg.type,
                        tool,
                        agent: null,
                        declaredAs: cfg,
                    });
                }
            }
        } catch (e) {
            Logger.error(
                `[PAC] ${relative(cc.rootPath, sourcePath)}: 加载工具失败 ${JSON.stringify(cfg)}`,
                e,
            );
        }
    }

    return refs;
}