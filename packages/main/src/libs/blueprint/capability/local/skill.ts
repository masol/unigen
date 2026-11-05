// file: skill.ts
import type { IProjectContext } from "$libs/project/type.js";
import matter from "@11ty/gray-matter";
import { tool } from "ai";
import Logger from "electron-log/main.js";
import fs from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { z } from "zod";
import type { LocalToolSpec, PacToolConfig, SkillInfo } from "./type.js";

/**
 * 技能(Skill)机制:
 *   - 一个技能 = 一个目录,入口 SKILL.md(front matter: name / description / tools?)
 *   - 系统提示词只列 name + description;LLM 判断相关时调用 load_skill 读正文,
 *     再按需 read_skill_file 读取目录内其它文件(渐进加载,节省上下文)。
 *   - SKILL.md 的 tools 语法同 PAC tools,路径相对技能目录,编译期并入所属 agent。
 *   - 不执行技能目录内的脚本。
 *
 * 技能不跨层继承:子 agent 需要技能时在自己的 front matter 里声明。
 *
 * 路径约定:
 *   - 技能目录以相对项目根的分段路径(base)保存；
 *   - 所有文件读取统一通过 prj.getPath([...base, ...relPaths]) 获取绝对路径；
 *   - 技能工具的 Tool 由 buildSkillTools 返回"工厂"，运行期由 materializeTools
 *     使用 ctx.prj 完成构建（避免在编译产物里缓存 prj）。
 */

export const SKILL_FILE = "SKILL.md";
export const LOAD_SKILL_TOOL = "load_skill";
export const READ_SKILL_FILE_TOOL = "read_skill_file";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_LIST_ENTRIES = 200;

export interface DiscoveredSkill extends SkillInfo {
    tools: PacToolConfig[];
}

export interface SkillToolKeys {
    load: string;
    read: string;
}

function projectPath(prj: IProjectContext, segments: string[]): string | undefined {
    return prj.getPath(segments);
}

function requireProjectPath(prj: IProjectContext, segments: string[]): string {
    const p = projectPath(prj, segments);
    if (!p) {
        throw new Error(`无法解析技能路径: ${segments.join("/")}`);
    }
    return p;
}

function splitRelPath(p: string): string[] {
    return p.replace(/[\\/]+/g, "/").split("/").filter((s) => s.length > 0);
}

/**
 * bases 中每一项:
 *   - 自身含 SKILL.md → 单个技能
 *   - 否则视为技能集合目录,扫描一级子目录
 * 重名技能保留先出现者。
 */
export async function discoverSkills(
    prj: IProjectContext,
    bases: string[][],
): Promise<DiscoveredSkill[]> {
    const out: DiscoveredSkill[] = [];
    const byName = new Map<string, string>();

    for (const base of bases) {
        const dir = projectPath(prj, base);
        if (!dir) {
            Logger.warn(`[PAC] 技能目录无法解析,已跳过: ${base.join("/")}`);
            continue;
        }

        const st = await fs.stat(dir).catch(() => null);
        if (!st?.isDirectory()) {
            Logger.warn(`[PAC] 技能目录不存在或不是目录,已跳过: ${base.join("/")}`);
            continue;
        }

        const single = await readSkill(prj, base);
        const found = single ? [single] : await readSkillChildren(prj, base);
        if (found.length === 0) {
            Logger.warn(`[PAC] 目录下未发现任何 ${SKILL_FILE}: ${base.join("/")}`);
        }
        for (const s of found) {
            const prev = byName.get(s.name);
            if (prev) {
                Logger.warn(`[PAC] 技能重名 "${s.name}",保留 ${prev},忽略 ${s.base.join("/")}`);
                continue;
            }
            byName.set(s.name, s.base.join("/"));
            out.push(s);
        }
    }
    return out;
}

async function readSkillChildren(
    prj: IProjectContext,
    base: string[],
): Promise<DiscoveredSkill[]> {
    const dir = projectPath(prj, base);
    if (!dir) return [];

    const entries = (await fs.readdir(dir, { withFileTypes: true }).catch(() => []))
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .sort((a, b) => a.name.localeCompare(b.name));

    const out: DiscoveredSkill[] = [];
    for (const e of entries) {
        const s = await readSkill(prj, [...base, e.name]);
        if (s) out.push(s);
    }
    return out;
}

async function readSkill(
    prj: IProjectContext,
    base: string[],
): Promise<DiscoveredSkill | null> {
    const entry = projectPath(prj, [...base, SKILL_FILE]);
    if (!entry) return null;

    let raw: string;
    try {
        raw = await fs.readFile(entry, "utf-8");
    } catch {
        return null;
    }

    const parsed = matter(raw) as { data?: Record<string, unknown>; content: string };
    const data = structuredClone(parsed.data ?? {});

    const fallbackName = base[base.length - 1] ?? "unnamed-skill";
    const name =
        typeof data.name === "string" && data.name.trim()
            ? data.name.trim()
            : fallbackName;
    const description = typeof data.description === "string" ? data.description.trim() : "";
    if (!description) {
        Logger.warn(`[PAC] 技能 ${name} 缺少 description,LLM 难以判断何时使用 (${base.join("/")})`);
    }

    let tools: PacToolConfig[] = [];
    if (Array.isArray(data.tools)) {
        tools = data.tools as PacToolConfig[];
    } else if (data.tools !== undefined) {
        Logger.warn(`[PAC] 技能 ${name} 的 tools 不是数组,已忽略 (${base.join("/")})`);
    }

    return { name, description, base, tools };
}

/** {{_BI_skill}} 的取值 */
export function buildSkillDoc(skills: SkillInfo[], keys: SkillToolKeys): string {
    if (skills.length === 0) return "_当前 agent 未关联任何技能。_";
    const lines = [
        `以下技能按需加载。任务与某个技能的描述相关时,先调用 \`${keys.load}\` 读取其完整说明并按说明执行;` +
        `说明中引用的其它文件用 \`${keys.read}\` 读取。未加载前不要猜测技能内容。`,
        "",
    ];
    for (const s of skills) {
        lines.push(`- \`${s.name}\`: ${s.description || "_未提供描述_"}`);
    }
    return lines.join("\n");
}

/**
 * 构造两个技能工具的"工厂"。
 *
 * 返回的 LocalToolSpec 只有 description/inputSchema 是编译期固化的;
 * 真正的 Tool 在 materializeTools 时使用运行期 ctx.prj 完成构建。
 * 这样编译产物不持有 prj。
 */
export function buildSkillTools(
    skills: SkillInfo[],
    keys: SkillToolKeys,
): { load: LocalToolSpec; read: LocalToolSpec } {
    const byName = new Map(skills.map((s) => [s.name, s] as const));
    const names = skills.map((s) => s.name) as [string, ...string[]];
    const getSkill = (name: string): SkillInfo => {
        const s = byName.get(name);
        if (!s) throw new Error(`未知技能: ${name}。可用: ${names.join(", ")}`);
        return s;
    };

    const loadDesc =
        "加载一个技能的完整说明(SKILL.md 正文)和技能目录内的文件清单。" +
        "任务与某技能的描述相关时,先调用本工具。";
    const loadInput = z.object({ name: z.enum(names).describe("技能名") });

    const readDesc =
        `读取技能目录内的文本文件(上限 ${MAX_FILE_BYTES / 1024} KB)。` +
        `路径取自 ${keys.load} 返回的文件清单。`;
    const readInput = z.object({
        skill: z.enum(names).describe("技能名"),
        path: z.string().min(1).describe("相对技能目录的文件路径,例如 'reference/forms.md'"),
    });

    return {
        load: {
            description: loadDesc,
            inputSchema: loadInput,
            build: (prj) =>
                tool({
                    description: loadDesc,
                    inputSchema: loadInput,
                    execute: async ({ name }) => {
                        const s = getSkill(name);
                        const entry = requireProjectPath(prj, [...s.base, SKILL_FILE]);
                        const raw = await fs.readFile(entry, "utf-8");
                        const parsed = matter(raw) as { content?: string };
                        const body = (parsed.content ?? "").trim();
                        const files = await listFiles(prj, s.base);
                        return [
                            `# 技能: ${s.name}`,
                            "",
                            body,
                            "",
                            `## 技能目录文件(用 ${keys.read} 读取)`,
                            "",
                            files.length > 0 ? files.map((f) => `- ${f}`).join("\n") : "_无其它文件_",
                        ].join("\n");
                    },
                }),
        },
        read: {
            description: readDesc,
            inputSchema: readInput,
            build: (prj) =>
                tool({
                    description: readDesc,
                    inputSchema: readInput,
                    execute: async ({ skill, path }) => {
                        const s = getSkill(skill);
                        const abs = await resolveInside(prj, s.base, path);
                        const st = await fs.stat(abs);
                        if (!st.isFile()) throw new Error(`不是文件: ${path}`);
                        if (st.size > MAX_FILE_BYTES) {
                            throw new Error(`文件过大(${st.size} 字节,上限 ${MAX_FILE_BYTES}): ${path}`);
                        }
                        const buf = await fs.readFile(abs);
                        if (buf.includes(0)) throw new Error(`疑似二进制文件,不支持读取: ${path}`);
                        return buf.toString("utf-8");
                    },
                }),
        },
    };
}

/** 解开符号链接后再判断越界,防止 symlink 逃逸出技能目录 */
async function resolveInside(
    prj: IProjectContext,
    base: string[],
    p: string,
): Promise<string> {
    if (isAbsolute(p)) throw new Error(`只允许技能目录内的相对路径: ${p}`);

    const relSegs = splitRelPath(p);
    if (relSegs.length === 0) throw new Error(`文件路径为空: ${p}`);

    let root: string;
    let real: string;
    try {
        root = await fs.realpath(requireProjectPath(prj, base));
        real = await fs.realpath(requireProjectPath(prj, [...base, ...relSegs]));
    } catch {
        throw new Error(`文件不存在: ${p}`);
    }

    const rel = relative(root, real);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error(`路径越界: ${p}`);
    }
    return real;
}

/** 递归列出文件(不跟随符号链接,跳过隐藏文件和 SKILL.md 自身) */
async function listFiles(prj: IProjectContext, base: string[]): Promise<string[]> {
    const root = requireProjectPath(prj, base);
    const out: string[] = [];

    const walk = async (dir: string): Promise<void> => {
        const entries = (await fs.readdir(dir, { withFileTypes: true }))
            .sort((a, b) => a.name.localeCompare(b.name));
        for (const e of entries) {
            if (out.length >= MAX_LIST_ENTRIES) return;
            if (e.name.startsWith(".")) continue;
            const abs = join(dir, e.name);
            if (e.isDirectory()) {
                await walk(abs);
            } else if (e.isFile()) {
                const rel = relative(root, abs).split(sep).join("/");
                if (rel !== SKILL_FILE) out.push(rel);
            }
        }
    };

    await walk(root);
    return out;
}