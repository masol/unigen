import { throwNotfound, throwPrecondition } from "$libs/utils/err.js";
import { knowledgeCenter } from "$libs/utils/kc.js";
import matter from "@11ty/gray-matter";
import Logger from "electron-log/main.js";
import fs from "node:fs/promises";
import { basename, dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { loadExternalTools } from "./loader.js";
import { buildToolDoc, jsonSchemaToZod, renderOutputSemantics } from "./schema.js";
import { scanTemplateVars } from "./template.js";
import type {
    CompileCache, CompiledPacAgent, JsonValue,
    PacFrontMatter, PacToolConfig, ToolRef,
} from "./type.js";
import { INPUT_VAR, TOOL_DOC_VAR, classifyVars, resolveOwnDefaults } from "./vars.js";

function sanitizeToolKey(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "_tool";
}

function uniqueKey(candidate: string, taken: Set<string>): string {
    const base = sanitizeToolKey(candidate);
    if (!taken.has(base)) return base;
    let n = 2;
    const suffix = () => `${base}_${n}`;
    while (taken.has(suffix())) n++;
    const next = suffix();
    Logger.warn(`[PAC] 工具名冲突,重命名为 ${next}`);
    return next;
}

/**
 * PAC 路径解析 —— 语义与代码模块的 import 一致:
 *   "./sub/x.md" | "sub/x.md" | "../x.md"  → 相对当前文件
 *   "/sub/x.md"                             → 相对 PAC 根目录
 *   ".md" 后缀可省略
 * 越界检查:禁止逃逸出 PAC 根目录。
 */
export function resolvePacPath(
    rootPath: string,
    currentDir: string,
    p: string,
): string {
    const normalized = p.replace(/[\\/]+/g, sep);
    const rootAnchored = normalized.startsWith(sep);
    let abs: string;

    if (rootAnchored) {
        const rel = normalized.slice(1);
        const withExt = rel.endsWith(".md") ? rel : `${rel}.md`;
        abs = resolve(rootPath, withExt);
    } else {
        const withExt = normalized.endsWith(".md") ? normalized : `${normalized}.md`;
        abs = resolve(currentDir, withExt);
    }

    abs = normalize(abs);
    const relToRoot = relative(rootPath, abs);
    if (relToRoot.startsWith(`..${sep}`) || isAbsolute(relToRoot)) {
        throwPrecondition(`[PAC] 路径越界,不允许逃出 pac 根目录: ${p}`);
    }
    return abs;
}

export function createCompileCache(rootPath: string): CompileCache {
    return { compiled: new Map(), compiling: new Set(), rootPath };
}

async function locateEntry(prjType: string): Promise<{ entry: string; root: string }> {
    const entry = await knowledgeCenter.getFile(prjType, "pac", "index.md");
    if (!entry) {
        throwNotfound(`[PAC] 入口文件未找到: ${prjType}/pac/index.md`);
    }
    return { entry, root: dirname(entry) };
}

/**
 * 递归编译 PAC Agent。编译期纯结构构建,与 ctx 无关;
 * cache 保证同一文件只编译一次,并检测循环引用。
 */
export async function compilePacAgent(
    prjType: string,
    absPath?: string,
    cache?: CompileCache,
): Promise<CompiledPacAgent> {
    let cc = cache;
    let entry: string;

    if (cc && absPath) {
        entry = absPath;
    } else {
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
    const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
    const { data, content: body } = parsed;
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

    const toolRefs = await loadToolRefs(fm.tools ?? [], cc, basePath, sourcePath);
    const toolDoc = buildToolDoc(toolRefs);

    // 用户提示词模板:显式内联 > 外部文件 > 默认 "{{_BI_input}}"。
    const { template: userTemplate, extraDefaults: utExtraDefaults } =
        await resolveUserTemplate(fm, cc.rootPath, basePath, sourcePath);

    if (Object.keys(utExtraDefaults).length > 0) {
        const main = resolveOwnDefaults(fm);
        const merged: Record<string, JsonValue> = { ...utExtraDefaults };
        for (const [k, v] of Object.entries(main)) {
            if (k in utExtraDefaults) {
                Logger.warn(
                    `[PAC] ${relative(cc.rootPath, sourcePath)}: ` +
                    `用户模板 setDefault.${k} 被主 agent setDefault.${k} 覆盖`,
                );
            }
            merged[k] = v;
        }
        fm.setDefault = merged;
    }

    const ownDefaults = Object.freeze(resolveOwnDefaults(fm));

    // 合并扫描:系统 + 用户两份模板共享渲染上下文,必须一起分桶,
    // 否则只在用户模板中出现的 _T_ / _BI_ 会漏加载。
    const scanAll = () =>
        classifyVars([
            ...scanTemplateVars(systemTemplate),
            ...scanTemplateVars(userTemplate),
        ]);

    let vars = scanAll();

    // 工具目录自动追加:仅在有工具且两份模板都未显式引用 {{_BI_tool}} 时触发
    if (toolRefs.length > 0 && !vars.bi.includes(TOOL_DOC_VAR)) {
        Logger.debug(`[PAC] ${name}: 模板未引用 {{${TOOL_DOC_VAR}}},自动追加工具目录`);
        systemTemplate = `${systemTemplate}\n\n## 可用工具\n\n{{${TOOL_DOC_VAR}}}\n`;
        vars = scanAll();
    }

    // 把 outputs 转为"最终回复要点"追加到系统提示词末尾。
    //
    // 核心设计:子 agent **不强制**返回 JSON——以要点清单引导自然语言覆盖
    // 关键信息,比强制结构化更稳(实证反复表明强制 JSON 会拖累 LLM 推理)。
    // 父 agent 的 LLM 直接阅读文本理解即可,运行期不解析不校验(见 agent.ts)。
    //
    // 刻意柔性:只说"应覆盖以下要点",不加"不要 JSON"硬约束,以便与现存
    // PAC 模板里"**强制约束:只返回 JSON**"的老指令兼容。模板清理后可考虑收紧。
    if (outputSchema) {
        const semantics = renderOutputSemantics(outputSchema);
        if (semantics) {
            systemTemplate =
                `${systemTemplate}\n\n## 最终回复要点\n\n` +
                `你的最终回复应清楚覆盖以下要点,供上游读者直接理解:\n\n${semantics}\n`;
            // semantics 是编译期字面量,不含模板变量;重扫一次保险
            vars = scanAll();
        }
    }

    return {
        name,
        description,
        config: fm,
        systemTemplate,
        userTemplate,
        inputSchema,
        outputSchema,
        toolRefs,
        toolDoc,
        vars,
        ownDefaults,
        basePath,
        rootPath: cc.rootPath,
        sourcePath,
    };
}

/** 用户模板文件允许在 front matter 中声明的字段。 */
const USER_TEMPLATE_FM_ALLOWED = new Set(["setDefault"]);

async function resolveUserTemplate(
    fm: PacFrontMatter,
    rootPath: string,
    currentDir: string,
    sourcePath: string,
): Promise<{ template: string; extraDefaults: Record<string, JsonValue> }> {
    const inline = fm.userTemplate;
    const path = fm.userTemplatePath;

    const hasInline = typeof inline === "string" && inline.trim().length > 0;
    const hasPath = typeof path === "string" && path.trim().length > 0;

    if (hasInline && hasPath) {
        throwPrecondition(
            `[PAC] userTemplate 与 userTemplatePath 不可同时声明 (${sourcePath})`,
        );
    }

    if (hasInline) {
        return { template: inline as string, extraDefaults: {} };
    }

    if (hasPath) {
        const abs = resolvePacPath(rootPath, currentDir, path as string);
        let raw: string;
        try {
            raw = await fs.readFile(abs, "utf-8");
        } catch (e) {
            throwPrecondition(
                `[PAC] 读取 userTemplatePath 失败 ${path}: ` +
                `${e instanceof Error ? e.message : String(e)} (${sourcePath})`,
            );
            return { template: "", extraDefaults: {} }; // unreachable
        }

        const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
        const utFm = parsed.data ?? {};
        const extraDefaults: Record<string, JsonValue> = {};
        const relAbs = relative(rootPath, abs);

        for (const [k, v] of Object.entries(utFm)) {
            if (!USER_TEMPLATE_FM_ALLOWED.has(k)) {
                Logger.warn(
                    `[PAC] 用户模板 ${relAbs} 的 front matter.${k} 已忽略` +
                    `(用户模板文件仅支持 setDefault) [由 ${relative(rootPath, sourcePath)} 引用]`,
                );
                continue;
            }
            if (k === "setDefault") {
                if (v && typeof v === "object" && !Array.isArray(v)) {
                    Object.assign(extraDefaults, v as Record<string, JsonValue>);
                } else {
                    Logger.warn(`[PAC] 用户模板 ${relAbs} 的 setDefault 不是对象,已忽略`);
                }
            }
        }

        const tpl = (parsed.content ?? "").trim();
        if (tpl.length === 0) {
            throwPrecondition(
                `[PAC] userTemplatePath 文件正文为空 ${path} (${sourcePath})`,
            );
        }
        return { template: tpl, extraDefaults };
    }

    return { template: `{{${INPUT_VAR}}}`, extraDefaults: {} };
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
                const subAbsPath = resolvePacPath(cc.rootPath, currentDir, cfg.path);
                const sub = await compilePacAgent("", subAbsPath, cc);
                const key = uniqueKey(cfg.alias ?? sub.name, taken);
                taken.add(key);
                refs.push({ key, origin: "agent", meta: null, agent: sub, declaredAs: cfg });
            } else {
                const loaded = await loadExternalTools(cfg);
                for (const [rawKey, meta] of Object.entries(loaded)) {
                    const key = uniqueKey(rawKey, taken);
                    taken.add(key);
                    refs.push({ key, origin: cfg.type, meta, agent: null, declaredAs: cfg });
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