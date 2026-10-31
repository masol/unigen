import { throwNotfound, throwPrecondition } from "$libs/utils/err.js";
import { knowledgeCenter } from "$libs/utils/kc.js";
import matter from "@11ty/gray-matter";
import Logger from "electron-log/main.js";
import fs from "node:fs/promises";
import { basename, dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { loadExternalTools } from "./loader.js";
import { buildToolDoc, jsonSchemaToZod, renderOutputSemantics } from "./schema.js";
import {
    LOAD_SKILL_TOOL, READ_SKILL_FILE_TOOL,
    buildSkillDoc, buildSkillTools, discoverSkills, type DiscoveredSkill,
} from "./skill.js";
import { scanTemplateVars } from "./template.js";
import type {
    CompileCache, CompiledPacAgent, JsonValue,
    PacFrontMatter, PacToolConfig, ToolRef,
} from "./type.js";
import {
    INPUT_VAR, SKILL_DOC_VAR, TOOL_DOC_VAR, classifyVars, resolveOwnDefaults,
} from "./vars.js";

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
 * PAC 路径解析,语义与 import 一致:
 *   "./sub/x" | "sub/x" | "../x" → 相对当前文件
 *   "/sub/x"                     → 相对 PAC 根目录
 * ext 非空时自动补后缀(默认 ".md");解析目录时传 null。
 * 禁止逃逸出 PAC 根目录。
 */
export function resolvePacPath(
    rootPath: string,
    currentDir: string,
    p: string,
    ext: string | null = ".md",
): string {
    const normalized = p.replace(/[\\/]+/g, sep);
    const rootAnchored = normalized.startsWith(sep);
    const rel = rootAnchored ? normalized.slice(1) : normalized;
    const withExt = ext && !rel.endsWith(ext) ? `${rel}${ext}` : rel;
    const abs = normalize(resolve(rootAnchored ? rootPath : currentDir, withExt));

    const relToRoot = relative(rootPath, abs);
    if (relToRoot === ".." || relToRoot.startsWith(`..${sep}`) || isAbsolute(relToRoot)) {
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
 * 递归编译 PAC Agent。纯结构构建,与 ctx 无关。
 * 同一 cache 内同一文件只编译一次,并检测循环引用;
 * 不传 cache 时每次调用都是一次全新编译(会重新读盘)。
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
    // gray-matter 按原文缓存解析结果,data 是共享引用;深拷贝后使用
    const fm = structuredClone(parsed.data ?? {}) as PacFrontMatter;

    let systemTemplate = (parsed.content ?? "").trim();
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

    const taken = new Set<string>();
    const toolRefs = await loadToolRefs(fm.tools ?? [], cc, basePath, sourcePath, taken);

    // 技能:声明的 tools 并入工具列表,再追加 load_skill / read_skill_file
    const skills = await loadSkills(fm.skills, cc, basePath, sourcePath);
    let skillDoc = "";
    if (skills.length > 0) {
        for (const s of skills) {
            if (s.tools.length === 0) continue;
            toolRefs.push(...(await loadToolRefs(s.tools, cc, s.dir, s.entry, taken)));
        }
        const loadKey = uniqueKey(LOAD_SKILL_TOOL, taken);
        taken.add(loadKey);
        const readKey = uniqueKey(READ_SKILL_FILE_TOOL, taken);
        taken.add(readKey);
        const keys = { load: loadKey, read: readKey };

        const st = buildSkillTools(skills, keys);
        toolRefs.push(
            { key: keys.load, origin: "skill", meta: null, agent: null, local: st.load },
            { key: keys.read, origin: "skill", meta: null, agent: null, local: st.read },
        );
        skillDoc = buildSkillDoc(skills, keys);
    }

    const toolDoc = await buildToolDoc(toolRefs);

    // 用户提示词模板:显式内联 > 外部文件 > 默认 "{{_BI_input}}"。
    const { template: userTemplate, extraDefaults: utExtraDefaults } =
        await resolveUserTemplate(fm, cc.rootPath, basePath, sourcePath);

    // 主 agent setDefault 优先于用户模板 setDefault
    const mainDefaults = resolveOwnDefaults(fm);
    for (const k of Object.keys(utExtraDefaults)) {
        if (k in mainDefaults) {
            Logger.warn(
                `[PAC] ${relative(cc.rootPath, sourcePath)}: ` +
                `用户模板 setDefault.${k} 被主 agent setDefault.${k} 覆盖`,
            );
        }
    }
    const ownDefaults: Readonly<Record<string, JsonValue>> = Object.freeze({
        ...utExtraDefaults,
        ...mainDefaults,
    });

    // 系统 + 用户两份模板共享渲染上下文,必须一起分桶
    const scanAll = () =>
        classifyVars([
            ...scanTemplateVars(systemTemplate),
            ...scanTemplateVars(userTemplate),
        ]);

    let vars = scanAll();

    if (toolRefs.length > 0 && !vars.bi.includes(TOOL_DOC_VAR)) {
        Logger.debug(`[PAC] ${name}: 模板未引用 {{${TOOL_DOC_VAR}}},自动追加工具目录`);
        systemTemplate = `${systemTemplate}\n\n## 可用工具\n\n{{${TOOL_DOC_VAR}}}\n`;
        vars = scanAll();
    }

    if (skills.length > 0 && !vars.bi.includes(SKILL_DOC_VAR)) {
        Logger.debug(`[PAC] ${name}: 模板未引用 {{${SKILL_DOC_VAR}}},自动追加技能清单`);
        systemTemplate = `${systemTemplate}\n\n## 可用技能\n\n{{${SKILL_DOC_VAR}}}\n`;
        vars = scanAll();
    }

    // outputs → "最终回复要点"。不强制 JSON,原因见 agent.ts。
    if (outputSchema) {
        const semantics = await renderOutputSemantics(outputSchema);
        if (semantics) {
            systemTemplate =
                `${systemTemplate}\n\n## 最终回复要点\n\n` +
                `你的最终回复应清楚覆盖以下要点,供上游读者直接理解:\n\n${semantics}\n`;
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
        skills: skills.map((s) => ({
            name: s.name, description: s.description, dir: s.dir, entry: s.entry,
        })),
        skillDoc,
        vars,
        ownDefaults,
        basePath,
        rootPath: cc.rootPath,
        sourcePath,
    };
}

async function loadSkills(
    raw: unknown,
    cc: CompileCache,
    currentDir: string,
    sourcePath: string,
): Promise<DiscoveredSkill[]> {
    if (raw === undefined || raw === null) return [];
    const list = typeof raw === "string" ? [raw] : raw;
    if (!Array.isArray(list) || list.some((p) => typeof p !== "string")) {
        throwPrecondition(`[PAC] front matter.skills 必须是字符串或字符串数组 (${sourcePath})`);
    }
    const dirs = (list as string[]).map((p) => resolvePacPath(cc.rootPath, currentDir, p, null));
    return discoverSkills(dirs);
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
        const utFm = structuredClone(parsed.data ?? {});
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
    taken: Set<string>,
): Promise<ToolRef[]> {
    const refs: ToolRef[] = [];

    for (const cfg of configs) {
        try {
            if (cfg.type === "agent") {
                const subAbsPath = resolvePacPath(cc.rootPath, currentDir, cfg.path);
                const sub = await compilePacAgent("", subAbsPath, cc);
                const key = uniqueKey(cfg.alias ?? sub.name, taken);
                taken.add(key);
                refs.push({ key, origin: "agent", meta: null, agent: sub, declaredAs: cfg });
                continue;
            }

            const loaded = await loadExternalTools(cfg);

            if (loaded.kind === "mcp_local") {
                // 局部 MCP:每个工具一个 ref,运行期按 config 重连
                const prefix = loaded.config.alias ? `${loaded.config.alias}_` : "";
                for (const info of loaded.tools) {
                    const key = uniqueKey(`${prefix}${info.name}`, taken);
                    taken.add(key);
                    refs.push({
                        key,
                        origin: "mcp_local",
                        meta: null,
                        agent: null,
                        mcpLocal: { config: loaded.config, tool: info },
                        declaredAs: cfg,
                    });
                }
                continue;
            }

            // builtin / search / 全局 mcp
            const origin = cfg.type === "mcp" ? "mcp_global" : cfg.type;
            for (const [rawKey, meta] of Object.entries(loaded.tools)) {
                const key = uniqueKey(rawKey, taken);
                taken.add(key);
                refs.push({ key, origin, meta, agent: null, declaredAs: cfg });
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