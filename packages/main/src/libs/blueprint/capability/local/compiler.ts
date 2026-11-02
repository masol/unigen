import { throwPrecondition } from "$libs/utils/err.js";
import { knowledgeCenter } from "$libs/utils/kc.js";
import matter from "@11ty/gray-matter";
import Logger from "electron-log/main.js";
import fs from "node:fs/promises";
import { basename, dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { z } from "zod";
import {
    INPUT_VAR, SKILL_DOC_VAR, TOOL_DOC_VAR, classifyVars,
} from "./context/index.js";
import { loadExternalTools } from "./loader.js";
import { buildToolDoc, jsonSchemaToZod, renderOutputSemantics } from "./schema.js";
import { resolveOwnDefaults, resolveSettings } from "./settings.js";
import {
    LOAD_SKILL_TOOL, READ_SKILL_FILE_TOOL,
    buildSkillDoc, buildSkillTools, discoverSkills, type DiscoveredSkill,
} from "./skill.js";
import { scanTemplateVars } from "./template.js";
import type {
    CompileCache, CompiledPacAgent, JsonValue,
    PacFrontMatter, PacToolConfig, ToolRef,
} from "./type.js";

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

export function createCompileCache(rootPath: string, rootEntry?: string): CompileCache {
    return { compiled: new Map(), compiling: new Set(), rootPath, rootEntry };
}

/** 由 rootPath + 绝对源文件路径生成稳定 agent id(用作 HistoryStore 的子键) */
export function buildAgentId(rootPath: string, sourcePath: string): string {
    const rel = relative(rootPath, sourcePath);
    const normalized = rel.split(sep).join("/");
    return normalized.endsWith(".md") ? normalized.slice(0, -3) : normalized;
}

/**
 * 定位入口。文件不存在返回 null,由上层构造直通 agent;其它错误照常冒泡。
 */
async function locateEntry(prjType: string): Promise<{ entry: string; root: string } | null> {
    const entry = await knowledgeCenter.getFile(prjType, "pac", "index.md");
    if (!entry) return null;
    return { entry, root: dirname(entry) };
}

/**
 * 构造直通 agent:无系统提示词、无工具,userTemplate 为 {{_BI_input}}。
 * 等价于把用户原始录入直送 LLM。
 */
function buildPassthroughAgent(prjType: string): CompiledPacAgent {
    const name = prjType || "passthrough";
    const vars = classifyVars([INPUT_VAR]);
    Logger.warn(`[PAC] 未找到 ${prjType}/pac/index.md,构造直通 agent "${name}"`);
    return {
        id: `__passthrough__/${prjType || "default"}`,
        name,
        description: `PAC agent "${name}" (直通模式,未找到 pac/index.md)`,
        passthrough: true,
        config: {},
        systemTemplate: "",
        userTemplate: `{{${INPUT_VAR}}}`,
        inputSchema: z.object({}),
        outputSchema: null,
        toolRefs: [],
        toolDoc: "_当前 agent 未声明任何工具。_",
        skills: [],
        skillDoc: "_当前 agent 未关联任何技能。_",
        vars,
        ownDefaults: Object.freeze({}),
        settings: resolveSettings({}),
        basePath: "",
        rootPath: "",
        sourcePath: `<passthrough:${prjType}>`,
    };
}

/**
 * 递归编译 PAC Agent。
 * 顶层调用时若入口文件不存在,返回直通 agent(不抛错);子级编译文件必须存在。
 *
 * CompileCache.rootEntry 记录"顶层调用首次定位到的入口文件",用于识别根 agent:
 * 根 agent 不允许声明 inputs/outputs(其输入是用户原始录入,输出是对用户的回复)。
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
        if (!loc) return buildPassthroughAgent(prjType);
        entry = absPath ?? loc.entry;
        cc = cache ?? createCompileCache(loc.root, entry);
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
    const fm = structuredClone(parsed.data ?? {}) as PacFrontMatter;

    let systemTemplate = (parsed.content ?? "").trim();
    if (systemTemplate.length === 0) {
        throwPrecondition(`[PAC] 正文(系统提示词)为空: ${sourcePath}`);
    }

    const name = fm.name ?? basename(sourcePath, ".md");
    const relSrc = relative(cc.rootPath, sourcePath);
    const description =
        fm.description ?? `PAC agent "${name}" (${relSrc})`;
    const basePath = dirname(sourcePath);
    const id = buildAgentId(cc.rootPath, sourcePath);
    const isRoot = sourcePath === cc.rootEntry;

    Logger.debug(`[PAC] 编译 ${name} [id=${id}, root=${isRoot}] ← ${relSrc}`);

    // 根 agent 不应该声明 inputs/outputs——它的输入是用户的原始录入(文本/文档/语音…),
    // 输出是直接回复给用户的内容,无需结构化契约。
    if (isRoot) {
        if (fm.inputs && Object.keys(fm.inputs).length > 0) {
            Logger.warn(
                `[PAC] 根 agent 不应声明 inputs,已忽略 (${relSrc})。` +
                `根 agent 的输入是用户原始录入,通过 {{${INPUT_VAR}}} 展开。`,
            );
        }
        if (fm.outputs && Object.keys(fm.outputs).length > 0) {
            Logger.warn(
                `[PAC] 根 agent 不应声明 outputs,已忽略 (${relSrc})。` +
                `根 agent 直接响应用户,无结构化输出契约。`,
            );
        }
    }

    const inputSchema = isRoot
        ? z.object({})
        : jsonSchemaToZod(fm.inputs, "inputs", sourcePath);
    const outputSchema = isRoot
        ? null
        : (fm.outputs ? jsonSchemaToZod(fm.outputs, "outputs", sourcePath) : null);

    const taken = new Set<string>();
    const toolRefs = await loadToolRefs(fm.tools ?? [], cc, basePath, sourcePath, taken);

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

    const { template: userTemplate, extraDefaults: utExtraDefaults } =
        await resolveUserTemplate(fm, cc.rootPath, basePath, sourcePath);

    const mainDefaults = resolveOwnDefaults(fm);
    for (const k of Object.keys(utExtraDefaults)) {
        if (k in mainDefaults) {
            Logger.warn(
                `[PAC] ${relSrc}: ` +
                `用户模板 setDefault.${k} 被主 agent setDefault.${k} 覆盖`,
            );
        }
    }
    const ownDefaults: Readonly<Record<string, JsonValue>> = Object.freeze({
        ...utExtraDefaults,
        ...mainDefaults,
    });

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
        id,
        name,
        description,
        passthrough: false,
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
        settings: resolveSettings(fm),
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
            return { template: "", extraDefaults: {} };
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