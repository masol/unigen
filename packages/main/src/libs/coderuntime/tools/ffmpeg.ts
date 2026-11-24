// packages/main/src/libs/coderuntime/tools/ffmpeg.ts
//
// FFmpeg 工具集（两个工具）：
//
//   - `probe_media`：媒体信息探查（封装 ffprobe，返回**结构化**结果）；
//   - `run_ffmpeg` ：执行 ffmpeg 命令（**参数形态就是 ffmpeg 语法**）。
//
// 【为什么参数形态不自造 DSL】
// Agent 已经通过训练数据学会了 ffmpeg 的参数语义（`-i` 之前的选项作用于
// 输入、之后的选项作用于输出，`-c:v` / `-vf` / `-map` ……）。任何自造的
// 结构化封装（`{input, output, codec}`）都只覆盖用法的一小部分，反而逼
// Agent 在封装之外另找通路，并让它把已学到的知识作废。因此 `run_ffmpeg`
// 直接接收 args 数组，**只在外围打容错补丁**。
//
// 【为什么单独封装 probe_media】
// 探查媒体信息是**高频且高频出错**的一类操作：
//   - `ffmpeg -i <file>` 会把信息写到 **stderr**，并以**非零退出码**结束；
//   - 原生输出是面向人类的自由文本，字段位置随版本变化；
//   - `ffprobe -of json` 的输出对模型来说又过于冗长。
// 因此这里封装为固定字段的结构化结果，并保留 ffprobe 作为唯一数据来源
// （不做“自己解析字节流”这类不可靠的替代实现）。
//
// 【run_ffmpeg 的容错补丁】
//   1. 剥除成对外层引号（AI 常把 shell 引号带进 JSON 数组）；
//   2. 预检 `-i` 输入文件是否存在（`-i` 是固定带值选项，解析零歧义），
//      报错给出「原始值 / 解析后绝对路径 / cwd」三元组；
//   3. **自动创建输出文件所在目录** —— 这是最常被浪费的一步：AI 经常
//      先 write_file / mkdir 再转码，而 ffmpeg 的语法要求输出在最后，
//      解析位置是确定的；
//   4. 输出路径是**已存在目录**时明确报错（AI 常写 `out/` 期望自动命名）；
//   5. 输出文件已存在且未指定 `-y` / `-n` 时明确报错，并给出可执行的
//      下一步（加 `-y` 或使用 `on_conflict`）。**不自动覆盖** —— 若 AI
//      把输出误写成输入路径，自动 `-y` 会静默销毁源文件；
//   6. 识别 `-version` / `-formats` 等无输入无输出的探测命令，不误拦；
//   7. 识别 `-f null -` 这类合法“丢弃输出”用法，不误报。
//
// 【stdin 语义】
// 固定 `stdin: "ignore"`。ffmpeg 在输出文件已存在且未指定 `-y` / `-n`
// 时会尝试从 stdin 读取覆盖确认，交互式挂起到超时；忽略 stdin 后它会
// 立即以非零退出码失败，报错清晰且可恢复。
//
// timeout 语义：默认 10 分钟（视频转码天然比脚本执行慢）；无上限；
// 强烈建议按素材时长显式传入。

import { stableConfig } from "$libs/store/stable.js";
import type { ToolDefinition } from "$libs/tooldb/type.js";
import { execa } from "execa";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { resolveFfprobeCommand } from "../engines/ffmpeg.js";
import { codeRuntimeManager } from "../manager.js";
import {
    formatCommand,
    limitOutput,
    prepareRunContext,
    resolveRuntimePath,
} from "./shared.js";

const DEFAULT_RUN_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_PROBE_TIMEOUT_MS = 30 * 1000;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function pathExists(target: string): Promise<boolean> {
    return fs.access(target).then(() => true, () => false);
}

// ── ffmpeg 参数解析辅助 ─────────────────────────────────────────

/** 需要忽略的协议前缀：这些目标的“存在性”不在本地文件系统上。 */
const REMOTE_SCHEME_PATTERN =
    /^(?:pipe|lavfi|concat|udp|tcp|gopher|http|https|rtmp|rtmps|rtsp|sftp|ftp|smb|srt|data|subfile|crypto|async|hls|tee):/i;

/**
 * 无输入、无输出的“信息类”命令首选项集合。
 *
 * 用精确匹配（不 lower-case）：`-L`（license）与 `-l` 是不同选项。
 */
const INFO_ONLY_FLAGS = new Set([
    "-version",
    "-V",
    "-h",
    "-help",
    "-?",
    "-formats",
    "-codecs",
    "-encoders",
    "-decoders",
    "-filters",
    "-pix_fmts",
    "-layouts",
    "-sample_fmts",
    "-bsfs",
    "-protocols",
    "-hwaccels",
    "-buildconf",
    "-license",
    "-L",
]);

/**
 * 判断某个 token 是否指向**本地文件**。
 *
 * 用于两处预检（输入存在性 / 输出目录创建）。宁可少校验，也不误判：
 *   - `-` 表示 stdin / stdout；
 *   - 以 `-` 开头的 token 是选项（POSIX 下真实文件极少以 `-` 开头）；
 *   - 各类协议前缀交给 ffmpeg 自己处理；
 *   - `null` 是 null muxer 的名字。
 */
function isLocalFileTarget(token: string): boolean {
    const trimmed = token.trim();
    if (!trimmed) return false;
    if (trimmed === "-") return false;
    if (trimmed.startsWith("-")) return false;
    if (REMOTE_SCHEME_PATTERN.test(trimmed)) return false;
    if (/^null$/i.test(trimmed)) return false;
    return true;
}

/**
 * 收集 `-i` 的输入值。
 *
 * `-i` 是固定带一个值的选项，因此 `args[i] === "-i"` → `args[i+1]` 就是
 * 输入值，解析零歧义（这也是不引入完整“选项是否带参”表的原因）。
 */
function collectInputPaths(args: readonly string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] !== "-i") continue;
        const value = args[i + 1];
        if (!value) continue;
        out.push(value);
        i += 1;
    }
    return out;
}

/** 是否为启动 banner（`-hide_banner`），不影响语义判断。 */
function isInfoOnlyInvocation(args: readonly string[]): boolean {
    return args.some((arg) => INFO_ONLY_FLAGS.has(arg));
}

/** 是否使用了 null muxer（`-f null`）。 */
function isNullMuxerInvocation(args: readonly string[]): boolean {
    for (let i = 0; i < args.length - 1; i += 1) {
        if (args[i] === "-f" && args[i + 1] === "null") return true;
    }
    return false;
}

/**
 * 剥除**成对包裹**的引号。
 *
 * 场景：Agent 常把 shell 命令行原样塞进 JSON 数组，于是出现
 * `"-i"`、`"'in.mp4'"` 这类带引号字符的参数。ffmpeg 会把它当成字面量
 * 文件名而失败。
 *
 * 保守约束：只有首尾是同一类引号、且内部**不含**同类引号时才剥除 ——
 * 这样 `drawtext=text='hello world'`、`select='eq(pict_type,I)'`
 * 这类真实含引号的滤镜表达式不受影响。
 */
function stripWrappingQuotes(token: string): string {
    if (token.length < 2) return token;
    const first = token[0];
    const last = token[token.length - 1];
    if (first !== last) return token;
    if (first !== '"' && first !== "'") return token;
    const inner = token.slice(1, -1);
    return inner.includes(first) ? token : inner;
}

/** 解析输出路径（ffmpeg 语法硬性要求：输出是最后一个位置参数）。 */
function resolveLastPositional(args: readonly string[]): string | undefined {
    const last = args[args.length - 1];
    if (!last) return undefined;
    return isLocalFileTarget(last) ? last : undefined;
}

// ── run_ffmpeg ─────────────────────────────────────────────────

const runInputSchema = z.object({
    args: z
        .array(z.string())
        .min(1)
        .describe(
            "ffmpeg 参数数组（**不含**可执行文件本身），直接按 ffmpeg 语法书写。" +
            "例如 [\"-i\", \"in.mp4\", \"-vf\", \"scale=1280:-2\", \"-c:v\", \"libx264\", " +
            "\"-crf\", \"23\", \"out.mp4\"]。" +
            "\n\n【容错说明（重要）】" +
            "\n- **不要**为了建输出目录而额外调用文件工具：本工具会自动创建**输出文件所在目录**。" +
            "\n- 参数按数组传递，每个元素是**一个**完整参数，不要写 shell 引号（工具会剥除成对引号作为容错）。" +
            "\n- `-i` 之后的选项作用于**输入**，最后一个输出之前的选项作用于**输出**；顺序写错结果完全不同。" +
            "\n- 输出文件已存在时必须显式加 `-y`（或使用 `on_conflict: \"overwrite\"`）；" +
            "不加会直接失败，本工具**不会**自动覆盖（防止把源文件覆盖掉）。",
        ),
    on_conflict: z
        .enum(["fail", "overwrite", "skip"])
        .default("fail")
        .describe(
            "输出文件已存在时的策略，映射到 ffmpeg 的 `-n` / `-y`。" +
            "\n- `fail`（默认）：不加任何覆盖标记，输出已存在时直接报错并提示下一步；" +
            "\n- `overwrite`：自动注入 `-y`（**会覆盖已有文件**，调用方应确认无误）；" +
            "\n- `skip`：自动注入 `-n`（输出已存在时 ffmpeg 以非零退出码结束，表示“已跳过”）。" +
            "\n\n若 args 里已显式写了 `-y` / `-n`，本字段不生效（以 args 为准）。" +
            "\n多输出场景下只约束**最后一个**输出。",
        ),
    timeout_ms: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            `执行超时（毫秒），默认 ${DEFAULT_RUN_TIMEOUT_MS}（10 分钟），无上限。` +
            "**强烈建议显式传入**：视频转码耗时与素材时长 / 分辨率强相关，" +
            "长素材按预估时长留 20–30% 富余，可避免“其实在正常转码但被判超时”。",
        ),
    env: z
        .record(z.string(), z.string())
        .optional()
        .describe("额外环境变量，会与主进程环境合并。"),
});

const runOutputSchema = z.object({
    success: z
        .boolean()
        .describe(
            "ffmpeg 是否以退出码 0 结束。" +
            "注意语义：这里表达的是**ffmpeg 命令本身的结果**（与 aria2 等工具类运行时一致），" +
            "而不是 run_python / run_node 那种“工具基础设施是否成功”。" +
            "另有正常但非零的场景（如只读探查、`-n` 跳过覆盖、`-f null -` 测速），" +
            "见 warnings。",
        ),
    exit_code: z
        .number()
        .int()
        .describe("ffmpeg 退出码；-1 表示未正常启动。"),
    stdout: z.string(),
    stderr: z.string().describe(
        "ffmpeg 的**进度与错误都写在这里**；真正的失败原因通常在末尾几行。",
    ),
    duration_ms: z.number().nonnegative(),
    command: z
        .string()
        .describe("实际执行的命令（仅展示 / 复现用，未做 shell 转义）。"),
    timed_out: z.boolean().describe("是否因超时被终止。"),
    cwd: z
        .string()
        .describe(
            "实际执行目录；参数中的相对路径都相对于它解析" +
            "（有项目时为项目根，无项目时为主进程 cwd）。",
        ),
    output_path: z
        .string()
        .optional()
        .describe(
            "解析出的输出文件绝对路径（ffmpeg 语法要求输出是最后一个位置参数）；" +
            "未识别到输出（如 `-f null -`）时为空。",
        ),
    output_size: z
        .number()
        .nonnegative()
        .optional()
        .describe("执行结束后输出文件的大小（字节）；文件不存在时为空。"),
    warnings: z
        .array(z.string())
        .default([])
        .describe("不影响执行、但需要模型知晓的提示（如“只读探查会以非零退出码结束”）。"),
});

export type FfmpegRunInput = z.infer<typeof runInputSchema>;
export type FfmpegRunOutput = z.infer<typeof runOutputSchema>;

export const ffmpegRunTool: ToolDefinition<FfmpegRunInput, FfmpegRunOutput> = {
    name: "run_ffmpeg",
    description:
        "使用 ffmpeg 处理音视频文件。**这是 Agent 的音视频执行工具**：" +
        "转码、裁剪、拼接、抽帧、提取 / 替换音轨、改变分辨率 / 码率、封装转换、滤镜等。" +
        "\n\n【接口就是 ffmpeg 语法】" +
        "args 直接写 ffmpeg 参数，不用转换成其它格式。" +
        "`-i` 之前的选项作用于**输入**，之后的选项作用于**输出**；顺序写错会得到完全不同的结果。" +
        "\n\n【路径约定】" +
        "\n- cwd 恒为项目根（有项目时）；参数里的相对路径直接相对项目根，无需绝对路径。" +
        "\n- **输出目录会被自动创建**：不要为了建目录而额外调用文件工具，直接一条命令到底。" +
        "\n\n【覆盖策略（必读）】" +
        "\n- 默认**不覆盖**：输出已存在且没写 `-y` / `-n` 时会直接失败，并提示下一步。" +
        "\n  这是有意的 —— 若你把输出路径误写成输入路径，自动覆盖会**销毁源文件**。" +
        "\n- 明确要覆盖时，加 `-y` 或传 `on_conflict: \"overwrite\"`；" +
        "明确要“存在则跳过”时，加 `-n` 或传 `on_conflict: \"skip\"`。" +
        "\n\n【超时建议】" +
        "\n- 默认 10 分钟；长素材转码请显式传 timeout_ms（按素材时长留 20–30% 富余）。" +
        "\n\n【返回结构】" +
        "\nsuccess / exit_code / stdout / stderr / timed_out / duration_ms / command / cwd / " +
        "output_path / output_size / warnings。" +
        "**ffmpeg 把进度与错误都写在 stderr**，失败时先读 stderr 末尾几行。" +
        "\n\n【何时改用 probe_media】" +
        "只想查看媒体信息（时长 / 分辨率 / 编码 / 帧率 / 音轨与字幕轨）时，用 probe_media：" +
        "它返回结构化结果；`ffmpeg -i <file>` 会把信息写到 stderr 并以非零退出码结束。" +
        "\n\n【环境保证】" +
        "ffmpeg 二进制由运行时层统一提供（托管安装，或回退到系统已安装的 ffmpeg），" +
        "调用方无需关心 PATH。",
    inputSchema: runInputSchema,
    outputSchema: runOutputSchema,
    execute: async (input) => {
        const cfg = stableConfig().get("codeRuntime");
        if (!cfg.engines?.ffmpeg?.enabled) {
            throw new Error(
                "FFmpeg 运行时未启用，请先在设置中开启后再试。",
            );
        }

        // cwd 语义见文件头注释。
        //
        // 与 run_python / run_node 不同，这里**不**拒绝“无项目”调用：
        // 那两个工具能从入参区分“纯内联执行”与“落盘 / 装依赖”，而 ffmpeg
        // 的读写都藏在自由参数里，无法区分；`ffmpeg -version` 之类的
        // 纯探测也必须能在无项目时跑通（设置页“测试一下”就是这条路径）。
        const project = prepareRunContext("运行 ffmpeg");
        const cwd = project.isProject ? project.cwd : process.cwd();

        const warnings: string[] = [];

        // ── 补丁 1：剥除成对外层引号 + 丢弃空参数 ──
        const args: string[] = [];
        for (const token of input.args) {
            const stripped = stripWrappingQuotes(token);
            if (!stripped) {
                warnings.push("已忽略一个空参数。");
                continue;
            }
            args.push(stripped);
        }
        if (args.length === 0) {
            throw new Error("args 不能为空。");
        }

        const infoOnly =
            isInfoOnlyInvocation(args) && collectInputPaths(args).length === 0;

        let outputPath: string | undefined;

        if (!infoOnly) {
            // ── 补丁 2：`-i` 输入存在性预检 ──
            const inputPaths = collectInputPaths(args);
            if (inputPaths.length === 0) {
                throw new Error(
                    "参数中缺少 `-i <输入文件>`。" +
                    "ffmpeg 至少需要一个输入文件；若只想查看媒体信息，请改用 probe_media 工具。",
                );
            }
            for (const raw of inputPaths) {
                if (!isLocalFileTarget(raw)) continue;
                const abs = resolveRuntimePath(raw);
                if (!(await pathExists(abs))) {
                    throw new Error(
                        `输入文件不存在：${raw}（解析为 ${abs}，cwd=${cwd}）。` +
                        "请确认路径，或改用相对项目根目录的路径。",
                    );
                }
            }

            // ── 补丁 3/4/5：输出路径预检 + 自动建目录 + 冲突判定 ──
            const lastPositional = resolveLastPositional(args);
            if (lastPositional) {
                const abs = resolveRuntimePath(lastPositional);
                outputPath = abs;

                let existing: { isDirectory: boolean; size: number } | undefined;
                try {
                    const stat = await fs.stat(abs);
                    existing = { isDirectory: stat.isDirectory(), size: stat.size };
                } catch {
                    existing = undefined;
                }

                if (existing?.isDirectory) {
                    throw new Error(
                        `最后一个参数看起来是输出路径，但它是一个已存在的目录：${abs}。` +
                        "ffmpeg 需要一个具体的输出文件名（例如 out.mp4），不会自动命名。",
                    );
                }

                const hasOverwrite = args.includes("-y");
                const hasSkip = args.includes("-n");

                if (existing && !hasOverwrite && !hasSkip) {
                    switch (input.on_conflict) {
                        case "overwrite":
                            // 注入 `-y`：全局选项，位置任意；放在最前面避免
                            // 被误读为某个输入选项。
                            args.unshift("-y");
                            warnings.push(
                                `输出文件已存在，已按 on_conflict="overwrite" 覆盖：${abs}`,
                            );
                            break;
                        case "skip":
                            args.unshift("-n");
                            warnings.push(
                                `输出文件已存在，已按 on_conflict="skip" 跳过：${abs}`,
                            );
                            break;
                        case "fail":
                        default:
                            throw new Error(
                                `输出文件已存在：${abs}。` +
                                "若希望覆盖，请显式加入 `-y`（或传 on_conflict: \"overwrite\"）；" +
                                "若希望保留原文件，请改用一个新文件名，或传 on_conflict: \"skip\"。",
                            );
                    }
                }

                // **自动创建输出目录**：这是容错补丁的核心收益 ——
                // 直接省掉 Agent “先建目录再转码”的额外往返。
                await fs.mkdir(dirname(abs), { recursive: true });
            } else if (isNullMuxerInvocation(args)) {
                // 合法用法：把结果丢进 null muxer（常用于测速 / 校验）。
                // 不建目录、不报“未识别输出”。
            } else {
                warnings.push(
                    "未识别到输出文件参数：ffmpeg 会以非零退出码结束（这是预期行为）。" +
                    "若只想查看媒体信息，请改用 probe_media。",
                );
            }
        }

        const runtime = await codeRuntimeManager.assertReady("ffmpeg");
        const timeoutMs = input.timeout_ms ?? DEFAULT_RUN_TIMEOUT_MS;

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            ...(input.env ?? {}),
        };

        const start = Date.now();
        const result = await execa(runtime.executablePath, args, {
            cwd,
            env,
            timeout: timeoutMs,
            reject: false,
            windowsHide: true,
            // 见文件头【stdin 语义】：避免“输出文件已存在”时挂起。
            stdin: "ignore",
        });

        // 输出文件 size：让 Agent 能确认产物真的写出来了。
        const outputSize = outputPath
            ? await fs
                .stat(outputPath)
                .then((stat) => stat.size)
                .catch(() => undefined)
            : undefined;

        return {
            success:
                typeof result.exitCode === "number" &&
                result.exitCode === 0,
            exit_code:
                typeof result.exitCode === "number" ? result.exitCode : -1,
            stdout: limitOutput(result.stdout ?? ""),
            stderr: limitOutput(result.stderr ?? ""),
            duration_ms: Date.now() - start,
            command: formatCommand(runtime.executablePath, args),
            timed_out: result.timedOut === true,
            cwd,
            output_path: outputPath,
            output_size: outputSize,
            warnings,
        };
    },
    toModelOutput: ({ output }) => {
        const lines: string[] = [
            `success=${output.success}  exit_code=${output.exit_code}  duration_ms=${output.duration_ms}  timed_out=${output.timed_out}`,
            `cwd: ${output.cwd}`,
        ];

        if (output.output_path) {
            lines.push(
                output.output_size !== undefined
                    ? `output: ${output.output_path}（${output.output_size} 字节）`
                    : `output: ${output.output_path}（未找到文件）`,
            );
        }

        for (const warning of output.warnings) {
            lines.push(`提示：${warning}`);
        }

        if (output.timed_out) {
            lines.push(
                "⚠️ 执行超时：长素材转码很容易超过默认超时。" +
                "请按素材时长显式传更大的 timeout_ms，或改用更快的编码器 / 降低分辨率后重试。",
            );
        }
        if (!output.success) {
            lines.push(
                "⚠️ ffmpeg 未以 0 退出。ffmpeg 把**进度与错误都写在 stderr**，" +
                "真正的失败原因通常在最后几行；请先读 stderr 末尾，再依次排查：" +
                "参数顺序（`-i` 前作用于输入、后作用于输出）、" +
                "输入文件是否存在、输出文件是否已存在（需要覆盖时加 `-y`）、" +
                "编码器名称是否正确。",
            );
        }

        lines.push(`command: ${output.command}`);
        lines.push("--- stdout ---");
        lines.push(output.stdout || "（空）");
        lines.push("--- stderr ---");
        lines.push(output.stderr || "（空）");

        return {
            type: "content",
            value: [{ type: "text", text: lines.join("\n") }],
        };
    },
};

// ── probe_media ────────────────────────────────────────────────

const probeInputSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "要探查的媒体文件路径。推荐使用相对项目根目录的路径（如 'assets/intro.mp4'）；" +
            "也接受 http(s) / rtsp 等网络 URL（此时跳过本地存在性检查）。",
        ),
    timeout_ms: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            `探查超时（毫秒），默认 ${DEFAULT_PROBE_TIMEOUT_MS}（30 秒）。` +
            "网络 URL 或超大文件可适当增大。",
        ),
});

const probeStreamSchema = z.object({
    index: z.number().int(),
    type: z.string().describe("video / audio / subtitle / data / attachment。"),
    codec: z.string().optional(),
    profile: z.string().optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    fps: z.number().optional(),
    sample_rate: z.number().int().optional(),
    channels: z.number().int().optional(),
    channel_layout: z.string().optional(),
    bit_rate: z.number().int().optional().describe("比特 / 秒。"),
    duration_seconds: z.number().optional(),
    language: z.string().optional(),
    title: z.string().optional(),
});

const probeFormatSchema = z.object({
    format_name: z.string().optional(),
    format_long_name: z.string().optional(),
    duration_seconds: z.number().optional(),
    size_bytes: z.number().int().optional(),
    bit_rate: z.number().int().optional().describe("比特 / 秒。"),
});

const probeOutputSchema = z.object({
    ok: z.boolean().describe("ffprobe 是否成功返回并解析出结果。"),
    path: z
        .string()
        .describe("实际探查的目标（本地文件为解析后的绝对路径）。"),
    duration_ms: z.number().nonnegative(),
    format: probeFormatSchema.optional(),
    streams: z.array(probeStreamSchema).default([]),
    error: z
        .string()
        .optional()
        .describe("失败原因（ffprobe 的 stderr 或 JSON 解析错误）。"),
});

export type ProbeMediaInput = z.infer<typeof probeInputSchema>;
export type ProbeMediaOutput = z.infer<typeof probeOutputSchema>;

/** 把 ffprobe 的字符串 / 数字字段安全转为 number（`"N/A"` 视为缺失）。 */
function toNumber(value: unknown): number | undefined {
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed || trimmed === "N/A") return undefined;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

/** 解析 ffprobe 的分数形式帧率（`30000/1001`）。 */
function toRate(value: unknown): number | undefined {
    if (typeof value !== "string") return toNumber(value);
    const trimmed = value.trim();
    if (!trimmed || trimmed === "N/A") return undefined;
    const parts = trimmed.split("/");
    if (parts.length === 2) {
        const numerator = Number(parts[0]);
        const denominator = Number(parts[1]);
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return undefined;
        if (denominator === 0) return undefined;
        const rate = numerator / denominator;
        return Number.isFinite(rate) && rate > 0
            ? Math.round(rate * 1000) / 1000
            : undefined;
    }
    const rate = Number(trimmed);
    return Number.isFinite(rate) && rate > 0
        ? Math.round(rate * 1000) / 1000
        : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object"
        ? value as Record<string, unknown>
        : undefined;
}

function asString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatBitRate(bps: number | undefined): string {
    if (bps === undefined || bps <= 0) return "";
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)}Mb/s`;
    if (bps >= 1_000) return `${Math.round(bps / 1_000)}kb/s`;
    return `${bps}b/s`;
}

function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined || bytes <= 0) return "";
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)}MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${bytes}B`;
}

export const probeMediaTool: ToolDefinition<ProbeMediaInput, ProbeMediaOutput> = {
    name: "probe_media",
    description:
        "读取媒体文件的元信息：时长、分辨率、编码 / profile、帧率、码率、" +
        "采样率 / 声道、音轨与字幕轨、语言标签等。" +
        "\n\n【优先使用本工具，而不是 `run_ffmpeg -i <file>`】" +
        "\n后者会把信息写到 **stderr**，并以**非零退出码**结束（看起来像失败）；" +
        "本工具基于 ffprobe，返回**结构化**结果，可直接用来决定后续 ffmpeg 参数" +
        "（例如选哪条音轨 `-map 0:<index>`、目标分辨率、是否需要去隔行）。" +
        "\n\n【路径约定】" +
        "\n- path 相对项目根解析（有项目时）；建议使用相对路径。" +
        "\n- 也接受 http(s) / rtsp 等网络 URL（会跳过本地存在性检查）。" +
        "\n\n【返回结构】" +
        "\nok / path / duration_ms / format{ format_name, duration_seconds, size_bytes, bit_rate } / " +
        "streams[]{ index, type, codec, profile, width, height, fps, sample_rate, channels, " +
        "bit_rate, duration_seconds, language, title } / error。" +
        "\n\n【典型用法】" +
        "\n1. 先 probe_media 拿到真实参数（时长 / 轨索引 / 编码）；" +
        "\n2. 再把结果转成 run_ffmpeg 的参数（例如 `-map 0:1` 选第二条轨，" +
        "`-c:v libx264` 从 h264 转码到需要的形式）。" +
        "\n\n【环境保证】" +
        "ffprobe 与 ffmpeg 同目录，由运行时层统一提供。",
    inputSchema: probeInputSchema,
    outputSchema: probeOutputSchema,
    execute: async (input) => {
        const cfg = stableConfig().get("codeRuntime");
        if (!cfg.engines?.ffmpeg?.enabled) {
            throw new Error(
                "FFmpeg 运行时未启用，请先在设置中开启后再试。",
            );
        }

        const project = prepareRunContext("探查媒体信息");
        const cwd = project.isProject ? project.cwd : process.cwd();

        const target = input.path.trim();
        if (!target) {
            throw new Error("path 不能为空。");
        }

        // 本地文件先做存在性检查：ffprobe 的 “No such file or directory”
        // 混在 stderr 里不易读懂；网络 URL 交给 ffprobe 自己处理。
        let resolvedPath: string | undefined;
        if (isLocalFileTarget(target)) {
            resolvedPath = resolveRuntimePath(target);
            if (!(await pathExists(resolvedPath))) {
                throw new Error(
                    `媒体文件不存在：${target}（解析为 ${resolvedPath}，cwd=${cwd}）。` +
                    "请确认路径，或改用相对项目根目录的路径。",
                );
            }
        }

        const runtime = await codeRuntimeManager.assertReady("ffmpeg");
        const ffprobe = await resolveFfprobeCommand(runtime.executablePath);
        if (!ffprobe) {
            throw new Error(
                "未找到 ffprobe（它应与 ffmpeg 同目录，或可从 PATH 找到）。" +
                "probe_media 依赖 ffprobe 获取结构化信息；" +
                "临时替代方案是用 run_ffmpeg 传 `-i <file>`（信息会写到 stderr）。",
            );
        }

        const args = [
            "-hide_banner",
            "-v", "error",
            "-show_format",
            "-show_streams",
            "-of", "json",
            resolvedPath ?? target,
        ];

        const timeoutMs = input.timeout_ms ?? DEFAULT_PROBE_TIMEOUT_MS;
        const start = Date.now();
        const result = await execa(ffprobe, args, {
            cwd,
            reject: false,
            windowsHide: true,
            timeout: timeoutMs,
            // ffprobe 若把 `-` 当输入会读 stdin；这里统一忽略，
            // 避免任何交互式挂起。
            stdin: "ignore",
        });
        const durationMs = Date.now() - start;

        const targetLabel = resolvedPath ?? target;
        const stdout = result.stdout ?? "";

        if (typeof result.exitCode !== "number" || result.exitCode !== 0) {
            const detail = (result.stderr || stdout).trim();
            return {
                ok: false,
                path: targetLabel,
                duration_ms: durationMs,
                streams: [],
                error:
                    detail ||
                    `ffprobe 以退出码 ${result.exitCode ?? -1} 结束`,
            };
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(stdout);
        } catch (error) {
            return {
                ok: false,
                path: targetLabel,
                duration_ms: durationMs,
                streams: [],
                error: `无法解析 ffprobe 的 JSON 输出：${errorMessage(error)}`,
            };
        }

        const root = asRecord(parsed);
        const formatRaw = asRecord(root?.format);
        const streamsRaw = Array.isArray(root?.streams) ? root.streams : [];

        const format = formatRaw
            ? {
                format_name: asString(formatRaw.format_name),
                format_long_name: asString(formatRaw.format_long_name),
                duration_seconds: toNumber(formatRaw.duration),
                size_bytes: toNumber(formatRaw.size),
                bit_rate: toNumber(formatRaw.bit_rate),
            }
            : undefined;

        const streams = streamsRaw
            .map((entry) => asRecord(entry))
            .filter((entry): entry is Record<string, unknown> => entry !== undefined)
            .map((entry) => {
                const tags = asRecord(entry.tags);
                return {
                    index: toNumber(entry.index) ?? -1,
                    type: asString(entry.codec_type) ?? "unknown",
                    codec: asString(entry.codec_name),
                    profile: asString(entry.profile),
                    width: toNumber(entry.width),
                    height: toNumber(entry.height),
                    fps: toRate(entry.r_frame_rate) ?? toRate(entry.avg_frame_rate),
                    sample_rate: toNumber(entry.sample_rate),
                    channels: toNumber(entry.channels),
                    channel_layout: asString(entry.channel_layout),
                    bit_rate: toNumber(entry.bit_rate),
                    duration_seconds: toNumber(entry.duration),
                    language: asString(tags?.language),
                    title: asString(tags?.title),
                };
            });

        return {
            ok: true,
            path: targetLabel,
            duration_ms: durationMs,
            format,
            streams,
        };
    },
    toModelOutput: ({ output }) => {
        const lines: string[] = [`ok=${output.ok}  path: ${output.path}`];

        if (!output.ok) {
            lines.push(`error: ${output.error ?? "未知错误"}`);
            return {
                type: "content",
                value: [{ type: "text", text: lines.join("\n") }],
            };
        }

        const format = output.format;
        if (format) {
            const summary: string[] = [];
            if (format.format_name) summary.push(format.format_name);
            if (format.format_long_name) {
                summary.push(
                    summary.length > 0
                        ? `(${format.format_long_name})`
                        : format.format_long_name,
                );
            }
            if (summary.length > 0) {
                lines.push(`format: ${summary.join(" ")}`);
            }

            const meta: string[] = [];
            if (format.duration_seconds !== undefined) {
                meta.push(`duration ${format.duration_seconds.toFixed(2)}s`);
            }
            const size = formatBytes(format.size_bytes);
            if (size) meta.push(`size ${size}`);
            const rate = formatBitRate(format.bit_rate);
            if (rate) meta.push(`bit_rate ${rate}`);
            meta.push(`streams ${output.streams.length}`);
            lines.push(meta.join("   "));
        }

        if (output.streams.length === 0) {
            lines.push("streams: （无）");
        } else {
            lines.push("streams:");
            for (const stream of output.streams) {
                const detail: string[] = [];
                detail.push(
                    stream.profile
                        ? `${stream.codec ?? "?"} (${stream.profile})`
                        : stream.codec ?? "?",
                );

                if (stream.type === "video") {
                    if (stream.width !== undefined && stream.height !== undefined) {
                        detail.push(`${stream.width}x${stream.height}`);
                    }
                    if (stream.fps !== undefined) detail.push(`${stream.fps}fps`);
                }
                if (stream.type === "audio") {
                    if (stream.sample_rate !== undefined) {
                        detail.push(`${stream.sample_rate}Hz`);
                    }
                    if (stream.channel_layout) detail.push(stream.channel_layout);
                    else if (stream.channels !== undefined) {
                        detail.push(`${stream.channels}ch`);
                    }
                }
                const rate = formatBitRate(stream.bit_rate);
                if (rate) detail.push(rate);
                if (stream.duration_seconds !== undefined) {
                    detail.push(`${stream.duration_seconds.toFixed(2)}s`);
                }
                if (stream.language) detail.push(`lang=${stream.language}`);
                if (stream.title) detail.push(`title=${stream.title}`);

                lines.push(
                    `#${stream.index} ${stream.type}: ${detail.join("  ")}`,
                );
            }
        }

        lines.push(`elapsed: ${output.duration_ms}ms`);

        return {
            type: "content",
            value: [{ type: "text", text: lines.join("\n") }],
        };
    },
};