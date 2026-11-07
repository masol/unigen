// skill-loader.ts
import matter from "@11ty/gray-matter";
import Logger from "electron-log/main.js";
import fg from "fast-glob";
import { dirname, join, relative, resolve, sep } from "node:path";
import pMap from "p-map";
import { loadTextFile } from "./file-text-loader.js";

export interface ScannedSkill {
    id: string;
    name: string;
    description: string;
    /** skill 目录绝对路径，便于后续注册 tool。 */
    path: string;
    /** skill 目录相对于扫描根的路径；根下 skill 为空串。不参与搜索。 */
    dir: string;
    /** SKILL.md 正文，已去除 front-matter。 */
    text: string;
    metadata?: Record<string, unknown>;
}

interface ParsedSkillSource {
    data: Record<string, unknown>;
    body: string;
}

/**
 * 文件级并行度：读取+解析均为 I/O 密集，8 足以打满磁盘吞吐，
 * 又不会轻易触发 EMFILE（macOS 默认 fd 上限较低）。
 */
const FILE_CONCURRENCY = 8;

/**
 * 使用 @11ty/gray-matter 解析 SKILL.md 的 front-matter 与正文。
 *
 * 与手写解析相比，gray-matter 完整支持 YAML 标量/数组/嵌套对象、
 * 引号、注释、多行字符串等，避免描述里出现 `:`、`#`、换行时被误解析。
 */
function parseSkillSource(raw: string): ParsedSkillSource {
    const parsed = matter(raw) as {
        data: Record<string, unknown>;
        content: string;
    };

    return {
        data: parsed.data ?? {},
        body: (parsed.content ?? "").trim(),
    };
}

/**
 * 递归扫描目录下的 SKILL.md。
 *
 * 默认忽略依赖/版本控制目录。注意：递归扫描可能误识别 skill 内部
 * references/examples 中的 SKILL.md；如需严格模式，可改为限制 deep 或
 * 增加 ignore。
 *
 * 单个 SKILL.md 解析失败、缺少 name/description、正文为空时只告警并跳过，
 * 不影响其它 skill 载入。文件读取/解析通过 pMap 并发，结果保持输入顺序。
 */
export async function scanSkillsFromDirectory(
    rootDir: string,
): Promise<ScannedSkill[]> {
    const root = resolve(rootDir);

    let files: string[];
    try {
        files = await fg("**/SKILL.md", {
            cwd: root,
            onlyFiles: true,
            dot: false,
            ignore: [
                "**/node_modules/**",
                "**/.git/**",
                "**/.svn/**",
                "**/.hg/**",
            ],
        });
    } catch (error) {
        Logger.warn(`[Search] 扫描 Skill 目录失败: ${root}`, error);
        return [];
    }

    const scanned = await pMap(
        files.sort(),
        async (relFile): Promise<ScannedSkill | null> => {
            const absFile = join(root, relFile);
            const raw = await loadTextFile(absFile);

            if (!raw.trim()) {
                Logger.warn(
                    `[Search] 跳过空或读取失败的 Skill: ${absFile}`,
                );
                return null;
            }

            let parsed: ParsedSkillSource;
            try {
                parsed = parseSkillSource(raw);
            } catch (error) {
                Logger.warn(
                    `[Search] 解析 Skill front-matter 失败，已忽略: ${absFile}`,
                    error,
                );
                return null;
            }

            const name =
                typeof parsed.data.name === "string"
                    ? parsed.data.name.trim()
                    : "";
            const description =
                typeof parsed.data.description === "string"
                    ? parsed.data.description.trim()
                    : "";

            if (!name || !description) {
                Logger.warn(
                    `[Search] 跳过无效 Skill（缺少 front-matter name/description）: ${absFile}`,
                );
                return null;
            }

            if (!parsed.body) {
                Logger.warn(
                    `[Search] 跳过无效 Skill（正文为空）: ${absFile}`,
                );
                return null;
            }

            const skillDirAbs = dirname(absFile);
            const relDir = relative(root, skillDirAbs).split(sep).join("/");
            const dir = relDir === "." ? "" : relDir;

            return {
                id: `skill:${dir || "."}`,
                name,
                description,
                path: skillDirAbs,
                dir,
                text: parsed.body,
                metadata: {
                    skillFile: relFile.split(sep).join("/"),
                },
            };
        },
        { concurrency: FILE_CONCURRENCY },
    );

    return scanned.filter((skill): skill is ScannedSkill => skill !== null);
}