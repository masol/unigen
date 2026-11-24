// packages/main/src/libs/coderuntime/tools/aria2.ts
//
// aria2 下载工具。
//
// 直接调用运行时提供的 aria2c，而不是复用 fetch 下载器：
//   - 工具语义明确：这就是 aria2；
//   - 支持 aria2 原生的多连接（-x/-s）、断点续传（-c）、自定义 header
//     与 checksum；
//   - 避免把 aria2 的 input-file 多源语义与 fetch 的 failover 语义混在
//     一起。
//
// 二进制来源由 `codeRuntimeManager.assertReady("aria2")` 决定：
//   - Windows：应用托管的官方 Release 二进制；
//   - Linux / macOS：系统已安装的 aria2c（由 manager 探测并解析为绝对
//     路径），对调用方透明。
//
// 路径语义与 run_python / run_node 保持一致：
//   - save_path 为相对路径时基于当前项目根解析；
//   - 未打开项目时必须传绝对路径（避免写入主进程 cwd）；
//   - 父目录不存在时自动创建。
//
// 输出中的 `command` 是给模型 / 日志看的展示串：请求头里可能出现
// `Authorization: Bearer ...` 一类凭据，这类值在展示串中被替换为 `***`
// （见 `redactArgs`）。真正传给 aria2c 的参数不受影响。

import { stableConfig } from "$libs/store/stable.js";
import type { ToolDefinition } from "$libs/tooldb/type.js";
import { execa } from "execa";
import { promises as fs } from "node:fs";
import { basename, dirname } from "node:path";
import { z } from "zod";
import { codeRuntimeManager } from "../manager.js";
import {
    formatCommand,
    limitOutput,
    resolveRequiredProjectPath,
} from "./shared.js";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * 需要脱敏的请求头名判定。
 *
 * 覆盖常见凭据载体：`Authorization` / `Proxy-Authorization` / `Cookie`、
 * 各类 token / secret / api-key / password / signature。判定只看头名，
 * 头值一律保留 `***`（不保留前缀，避免长度 / 前缀泄露）。
 */
const SENSITIVE_HEADER_PATTERN =
    /authorization|cookie|token|secret|api[-_]?key|password|signature/i;

/**
 * 单个 `--header` 值的脱敏。
 *
 * aria2 的 header 形式是 `Name: Value`；没有冒号的值（畸形输入）整体
 * 替换为 `***`。非敏感头保持原样，尽量保留可复现信息。
 */
function maskHeaderValue(raw: string): string {
    const colon = raw.indexOf(":");
    if (colon <= 0) return "***";
    const name = raw.slice(0, colon).trim();
    if (!SENSITIVE_HEADER_PATTERN.test(name)) return raw;
    return `${name}: ***`;
}

/**
 * 生成**展示用**参数（不改变真正执行的 args）。
 *
 * 只处理 `--header` 这一种带凭据的选项；其余参数（URL、路径、连接数、
 * checksum）保持原样，便于复现。URL 内嵌凭据（`https://user:pass@host`）
 * 不在本次脱敏范围内。
 */
function redactArgs(args: readonly string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i]!;
        out.push(arg);
        if (arg !== "--header") continue;
        const value = args[i + 1];
        if (value === undefined) continue;
        out.push(maskHeaderValue(value));
        i += 1;
    }
    return out;
}

const inputSchema = z.object({
    url: z
        .string()
        .url()
        .describe(
            "要下载的 URL。支持 aria2 支持的协议（http/https/ftp 等）。" +
            "需要多源下载时，请使用 aria2 的 mirror 语义自行构造输入；" +
            "本工具当前保持单 URL，避免与 fetch 的 failover 语义混淆。",
        ),
    save_path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "保存文件路径。相对路径基于当前项目根解析；" +
            "未打开项目时必须传绝对路径。父目录不存在时自动创建。",
        ),
    connections: z
        .number()
        .int()
        .min(1)
        .max(16)
        .default(3)
        .describe(
            "每文件连接数（aria2 -x/-s）。默认 3；过高可能被服务器限流，" +
            "建议根据站点策略调整。",
        ),
    headers: z
        .record(z.string(), z.string())
        .optional()
        .describe(
            "额外 HTTP 请求头，例如 { \"Authorization\": \"Bearer ...\" }。" +
            "会作为 aria2 --header 传入；输出中此类头的值会被脱敏为 ***。",
        ),
    checksum: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
            "下载后校验和，格式如 \"sha-256=<hex>\"。" +
            "会作为 aria2 --checksum 传入；校验失败时 aria2c 以非零退出。",
        ),
    timeout_ms: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            `下载超时（毫秒），默认 ${DEFAULT_TIMEOUT_MS}（30 分钟）。` +
            "超时后 aria2c 子进程会被终止。",
        ),
});

const outputSchema = z.object({
    success: z
        .boolean()
        .describe("aria2c 是否以退出码 0 结束。"),
    exit_code: z
        .number()
        .int()
        .describe("aria2c 退出码；-1 表示未正常启动。"),
    stdout: z.string(),
    stderr: z.string(),
    duration_ms: z.number().nonnegative(),
    command: z
        .string()
        .describe(
            "实际执行的命令（仅展示 / 复现用，未做 shell 转义；" +
            "敏感请求头的值已脱敏为 ***）。",
        ),
    timed_out: z.boolean().describe("是否因超时被终止。"),
    save_path: z.string().describe("最终尝试保存的绝对路径。"),
    size: z
        .number()
        .nonnegative()
        .optional()
        .describe("下载完成后文件大小（字节）；文件不存在时为空。"),
});

export type Aria2DownloadInput = z.infer<typeof inputSchema>;
export type Aria2DownloadOutput = z.infer<typeof outputSchema>;

export const aria2DownloadTool: ToolDefinition<
    Aria2DownloadInput,
    Aria2DownloadOutput
> = {
    name: "aria2_download",
    description:
        "使用 aria2 多线程下载文件。**这是 Agent 的文件下载工具**：" +
        "适合下载模型、数据集、压缩包、二进制依赖等大文件。" +
        "\n\n【何时使用】" +
        "\n- 需要多连接加速下载；" +
        "\n- 需要断点续传（save_path 已存在时 aria2c 默认续传）；" +
        "\n- 需要自定义请求头或下载后校验和。" +
        "\n\n【路径约定】" +
        "\n- save_path 推荐使用相对项目根目录的路径（如 'assets/model.bin'）；" +
        "\n- 未打开项目时必须传绝对路径；" +
        "\n- 父目录不存在时自动创建。" +
        "\n\n【返回结构】" +
        "\nsuccess / exit_code / stdout / stderr / timed_out / duration_ms / command / save_path / size。" +
        "success=false 时先读 stderr，再检查 URL、鉴权头、磁盘空间与网络代理。" +
        "\n\n【环境保证】" +
        "aria2c 由运行时层统一提供（Windows 使用应用托管的官方二进制；" +
        "Linux / macOS 使用系统已安装的 aria2c），调用方无需关心 PATH；" +
        "不会读取用户 ~/.aria2 配置。",
    inputSchema,
    outputSchema,
    execute: async (input) => {
        const cfg = stableConfig().get("codeRuntime");
        if (!cfg.engines?.aria2?.enabled) {
            throw new Error(
                "aria2 运行时未启用，请先在设置中开启后再试。",
            );
        }

        const savePath = resolveRequiredProjectPath(
            input.save_path,
            "save_path",
        );
        const runtime = await codeRuntimeManager.assertReady("aria2");

        await fs.mkdir(dirname(savePath), { recursive: true });

        const args: string[] = [
            input.url,
            "--dir", dirname(savePath),
            "--out", basename(savePath),
            "-x", String(input.connections),
            "-s", String(input.connections),
            "-c",
            "--allow-overwrite=false",
            "--auto-file-renaming=false",
            "--no-conf",
            "--summary-interval=0",
            "--console-log-level=notice",
            "--show-console-readout=false",
            "--enable-color=false",
        ];

        for (const [key, value] of Object.entries(input.headers ?? {})) {
            args.push("--header", `${key}: ${value}`);
        }
        if (input.checksum) {
            args.push("--checksum", input.checksum);
        }

        const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;
        const start = Date.now();
        const result = await execa(runtime.executablePath, args, {
            reject: false,
            windowsHide: true,
            timeout: timeoutMs,
        });

        const size = await fs
            .stat(savePath)
            .then((s) => s.size)
            .catch(() => undefined);

        return {
            success:
                typeof result.exitCode === "number" &&
                result.exitCode === 0,
            exit_code:
                typeof result.exitCode === "number" ? result.exitCode : -1,
            stdout: limitOutput(result.stdout ?? ""),
            stderr: limitOutput(result.stderr ?? ""),
            duration_ms: Date.now() - start,
            // 展示串对凭据脱敏；真正执行的 args 未改动。
            command: formatCommand(
                runtime.executablePath,
                redactArgs(args),
            ),
            timed_out: result.timedOut === true,
            save_path: savePath,
            size,
        };
    },
    toModelOutput: ({ output }) => {
        const lines: string[] = [
            `success=${output.success}  exit_code=${output.exit_code}  duration_ms=${output.duration_ms}  timed_out=${output.timed_out}`,
            `save_path: ${output.save_path}`,
            output.size !== undefined
                ? `size: ${output.size}`
                : "size: （未找到文件）",
        ];

        if (output.timed_out) {
            lines.push(
                "⚠️ 下载超时：可增大 timeout_ms、检查网络，或拆分大文件。",
            );
        }
        if (!output.success) {
            lines.push(
                "⚠️ aria2c 未以 0 退出；请检查 stderr、URL、鉴权头、磁盘空间与代理设置。",
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