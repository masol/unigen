// packages/main/src/libs/loader/downloader.ts
//
// 多源下载核心。
//
// 【设计原则】：稳定性 > 速度
//
//   - **基于 Node.js 内置 fetch + 流式写盘**：全程无第三方下载引擎，
//     所有资源在 try/finally 中显式关闭，所有回调都 try/catch 包裹，
//     所有 Promise 都在自己的 async 链上 await —— **不存在孤儿
//     Promise**。不引入第三方并发下载器（并发 fetch 中一路失败不会
//     取消其他在飞请求，这些 rejected Promise 会成为无法捕获的
//     unhandled rejection，在 Node 15+ 默认
//     `--unhandled-rejections=throw` 下会直接带崩主进程）。默认后端
//     保持为自研 fetch 实现，行为可审计、可预测。
//   - **速度诉求交给 aria2**：`backend: "aria2"` 或 `"auto"` 时，如果
//     aria2c 可用，跨源并行分块下载，失败自动回退 fetch。
//   - **下载 / 测速分离**：本模块不做主动选源测速；调用方若需要可先
//     调用 `$libs/loader/probe.js` 的 `probeUrls / sortByLatency` 把
//     候选 URL 排好序再传入 `sources`。`sources` 的顺序即尝试顺序。
//   - **GitHub 代理自动注入**：当 `opts.isGithub === true` 且
//     `opts.isChina` 为 true（缺省时按系统时区推断），会自动把
//     `github-proxies.ts` 中的可用代理插到 `sources` 前方。
//   - **UA 按源分流**：仅 GitHub 官方 / GitHub 代理使用浏览器 UA；
//     普通镜像（TUNA / USTC 等）不发送自定义 UA，避免触发镜像侧的
//     浏览器 UA 防盗链（403）。见 `user-agent.ts`。
//   - **容错**：`failoverOnError = true`（默认）时，一个源失败会尝试
//     下一个；关闭时直接抛错，不做下一源尝试。
//   - **错误归因**：
//       · `isLocalFsError()` —— ENOENT / EACCES / ENOSPC / EROFS / EMFILE …
//         这类**本机文件系统错误**与下载源无关，换源 / 换后端都不可能成功。
//         本模块会立即终止 failover 并单独打日志。
//       · 其余错误才按"源失败"处理并 failover。
//   - **断点续传**：`skipExisting = true` 时复用同名文件；请求带
//     `Range: bytes=<localSize>-`，服务器若返回 206 则追加写，若返回 200
//     （服务器忽略 Range）则从 0 覆盖，若返回 416 且本地大小与远端一致
//     则视为已完整。**大小不匹配的 416 会删本地文件后从 0 重下**，
//     避免"永远无法续传成功"的陷阱。
//   - **反劫持**：`rejectHtml = true` 时：
//       · 已有文件头部检查（续传前）——命中则删文件从头下载；
//       · HTTP `content-type: text/html` —— 视为拦截页直接失败；
//       · 下载完成后再做一次文件头检查。
//     命中一律删文件，避免 `skipExisting` 反复命中坏文件形成死循环。
//   - **429 / 503 退避**：携带 `Retry-After` 时按指示等待；否则指数
//     退避；重试用尽后进入 failover。**退避等待本身可被 AbortSignal
//     中断**（见 `sleep()`），取消不必等退避窗口自然结束。
//   - **取消**：AbortSignal 会中断 fetch 请求体、可中断的退避等待，
//     并通过 execa 的 `cancelSignal` 终止 aria2 子进程（POSIX 先
//     SIGTERM，超时后 SIGKILL；Windows 走 taskkill 终止进程树）。
//     部分文件保留用于下次续传。
//
// 已知限制：
//   - aria2 多源时的进度解析依赖其 console 输出格式（`[#gid xx% ]`）；
//     若未来 aria2 输出格式变化，进度会降级为 0，不影响下载本身；
//   - aria2 多源要求所有 URL 的 basename 一致（同文件名），否则会被
//     视为多个文件；本模块保证 `sources` 来自同一归档的不同镜像，
//     basename 天然相同；
//   - fetch 后端不做并行分块；单文件带宽上限取决于单个 TCP 连接。
//     需要跨连接带宽时使用 aria2 后端。

import Logger from "electron-log/main.js";
import { execa } from "execa";
import { ensureDir } from "fs-extra";
import { open, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
    GITHUB_BROWSER_UA,
    GITHUB_PROXIES,
    type GithubProxy,
} from "./github-proxies.js";
import {
    buildUserAgentHeaders,
    shouldUseGithubBrowserUa,
} from "./user-agent.js";

/** 单次请求重试次数（fetch 后端）。 */
const FETCH_MAX_RETRIES = 3;
/** 进度回调最小间隔（毫秒），避免高频刷新。 */
const PROGRESS_THROTTLE_MS = 200;
/** 429/503 无 Retry-After 时的最大退避（毫秒）。 */
const RETRY_MAX_DELAY_MS = 10_000;

export type DownloadBackend = "auto" | "fetch" | "aria2";

export interface DownloadProgressSnapshot {
    /** 已传输字节 */
    transferredBytes: number;
    /** 文件总字节；下载源未返回长度时为 0 */
    totalBytes: number;
    /** 0-100 */
    percent: number;
    /** 瞬时速度（字节/秒） */
    speedBytesPerSecond?: number;
    /** 预估剩余秒数 */
    etaSeconds?: number;
}

export interface DownloadSource {
    /** 实际下载 URL */
    url: string;
    /**
     * 可选标签；用于日志 / onSourceChange 回调识别
     * （例如 `china:ghproxy` / `official`）。
     */
    label?: string;
}

/** 外部注入的 aria2 可用性信息。 */
export interface Aria2Info {
    /** aria2c 是否可用 */
    available: boolean;
    /** aria2c 绝对路径；缺省时回退到 PATH 查找 */
    path?: string;
}

export interface DownloadOptions {
    /** 候选下载源（顺序即尝试顺序；调用方通常已按测速结果排序）。 */
    sources: DownloadSource[];
    savePath: string;
    /** aria2 后端的并发连接数；缺省 3。fetch 后端忽略此参数。 */
    parallelStreams?: number;
    /**
     * 同大小文件跳过 / 断点续传；缺省 true。
     */
    skipExisting?: boolean;
    /** 取消信号；Abort 时中断下载，不删除已下载文件 */
    signal?: AbortSignal;
    /** 进度回调；high-frequency，由调用方决定是否节流 */
    onProgress?: (snapshot: DownloadProgressSnapshot) => void;
    /** 当前尝试的源发生变化（i.e. 上一个失败 / 刚开始） */
    onSourceChange?: (source: DownloadSource, index: number) => void;
    /**
     * 单源失败后是否尝试下一个源。默认 true。
     *
     * 注意：本机文件系统错误（ENOENT/EACCES/ENOSPC…）**不受此开关影响**，
     * 永远直接终止 failover。
     */
    failoverOnError?: boolean;
    /**
     * 后端选择。
     *   - `fetch`（默认）：Node.js 内置 fetch；行为最稳定；
     *   - `auto`：检测到 aria2c 时优先 aria2，失败时自动回退 fetch；
     *   - `aria2`：强制使用 aria2，不可用时抛错（调用方自行处理）。
     */
    backend?: DownloadBackend;
    /**
     * 下载源是否为 GitHub 官方地址（github.com）。
     *
     * 当为 true 且满足“中国大陆”条件时，自动在 `sources` 前方插入
     * GitHub 加速代理；代理清单见 `github-proxies.ts`。
     */
    isGithub?: boolean;
    /**
     * 是否位于中国大陆。
     *
     * 缺省时按系统时区推断；显式传入可覆盖自动判断
     * （例如应用已通过 IP 定位拿到准确地域）。
     */
    isChina?: boolean;
    /**
     * 下载完成后检查文件头，拒绝 HTML 拦截页。
     *
     * 使用 GitHub 代理时默认开启；显式传 false 可关闭。
     */
    rejectHtml?: boolean;
    /**
     * aria2 后端失败后是否回退到 fetch 后端重试。
     * 默认 true；设为 false 时 aria2 失败直接抛错。
     *
     * 注意：**取消（AbortSignal 中止）不属于"后端失败"**，不会回退。
     */
    fallbackToFetchOnAria2Error?: boolean;
}

export interface DownloadResult {
    url: string;
    savePath: string;
    size: number;
    /**
     * 是否命中已有文件（未重新下载）。
     *
     * - 完整下载 / 断点续传追加写：`false`；
     * - 416 且本地大小与远端一致、或 206 续传起点恰为文件末尾：`true`。
     */
    reused: boolean;
    /** 实际使用的源 */
    source: DownloadSource;
    /** 实际使用的后端 */
    backend: "fetch" | "aria2";
}

// ─── 错误分类工具 ─────────────────────────────────────────────

const LOCAL_FS_ERROR_CODES: ReadonlySet<string> = new Set([
    "ENOENT",
    "EACCES",
    "EPERM",
    "EROFS",
    "ENOSPC",
    "EDQUOT",
    "EMFILE",
    "ENFILE",
    "EBUSY",
    "EISDIR",
    "ENOTDIR",
    "ENAMETOOLONG",
    "ETXTBSY",
]);

interface NodeErrorShape {
    name?: unknown;
    code?: unknown;
    errno?: unknown;
    syscall?: unknown;
    path?: unknown;
    message?: unknown;
}

function nodeErrorShape(err: unknown): NodeErrorShape | null {
    return err !== null && typeof err === "object"
        ? (err as NodeErrorShape)
        : null;
}

function errorCodeOf(err: unknown): string | undefined {
    const code = nodeErrorShape(err)?.code;
    return typeof code === "string" ? code : undefined;
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function isLocalFsError(err: unknown): boolean {
    const code = errorCodeOf(err);
    return typeof code === "string" && LOCAL_FS_ERROR_CODES.has(code);
}

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
    if (signal?.aborted) return true;
    if (errorCodeOf(err) === "ABORT_ERR") return true;
    const name = nodeErrorShape(err)?.name;
    if (name === "AbortError") return true;
    return /已取消|aborted/i.test(errorMessage(err));
}

/**
 * 构造标准化的取消错误。
 *
 * `name = "AbortError"` 让 `isAbortError()` 与上层（manager / 调用方）
 * 可以稳定识别"这次失败是取消而不是网络故障"，无需依赖错误文案。
 */
function abortError(message = "下载已被取消"): Error {
    const err = new Error(message);
    err.name = "AbortError";
    return err;
}

function callSafely(label: string, fn: () => void): void {
    try {
        fn();
    } catch (err) {
        Logger.warn(`[Downloader] ${label} 回调异常：${errorMessage(err)}`);
    }
}

/**
 * 可被 AbortSignal 中断的 sleep。
 *
 * 之前的实现是裸 `setTimeout`：用户在 429/503 退避窗口（最长 10s）内
 * 取消下载时，AbortSignal 只能"等退避自然结束再生效"，界面上表现为
 * 点击取消后无响应。这里在等待期间监听 abort，立即 reject。
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError());
            return;
        }

        const cleanup = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
            cleanup();
            reject(abortError());
        };
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);

        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/**
 * 安全取消 fetch body（未消费的响应需要显式 cancel 释放连接）。
 *
 * 注意：`body.locked` 为 true 表示已有 reader 持有该流。此时
 * `body.getReader()` 会同步抛 TypeError，`body.cancel()` 也会 reject，
 * 两条路都无法从"外部"安全取消 —— 只能交给持有方（本轮调用栈）自己
 * 清理。因此这里直接跳过，不做无效尝试。
 *
 * 本模块内所有调用点（416 / 非 2xx / content-type 拦截 / 续传已完成）
 * 都发生在 `getReader()` 之前，正常情况下 `locked` 恒为 false。
 */
async function safeBodyCancel(res: Response): Promise<void> {
    const body = res.body;
    if (!body || body.locked) return;
    await body.cancel().catch(() => undefined);
}

/**
 * 头部检查：文件开头是否是 HTML。
 *
 * 用于识别"proxy 被限流 / UA 被识别"后的拦截页。
 */
async function assertFileNotHtml(filePath: string): Promise<void> {
    const handle = await open(filePath, "r");
    try {
        const buffer = Buffer.alloc(512);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        const head = buffer
            .subarray(0, bytesRead)
            .toString("utf8")
            .trimStart()
            .toLowerCase();
        if (
            head.startsWith("<!doctype html") ||
            head.includes("<html") ||
            head.includes("<head")
        ) {
            throw new Error(
                "下载内容疑似为 HTML 拦截页（代理被限流或 UA 被识别），请检查网络",
            );
        }
    } finally {
        await handle.close().catch(() => undefined);
    }
}

/**
 * 校验产物不是 HTML 拦截页；命中时**删除该文件**。
 *
 * 删除是必要的：否则 `skipExisting` 会让下次续传命中同一份坏文件，
 * 形成"每次都校验失败"的死循环。
 */
async function assertDownloadedFileNotHtml(filePath: string): Promise<void> {
    try {
        await assertFileNotHtml(filePath);
    } catch (err) {
        await rm(filePath, { force: true }).catch(() => undefined);
        Logger.warn(
            `[Downloader] 已删除疑似 HTML 拦截页：${filePath}（${errorMessage(err)}）`,
        );
        throw err;
    }
}

// ─── aria2 外部配置与检测 ─────────────────────────────────

let aria2cPathCache: string | null | undefined;
let aria2ExternalInfo: Aria2Info | undefined;

export function setAria2Info(info: Aria2Info | null): void {
    if (info === null) {
        aria2ExternalInfo = undefined;
    } else {
        aria2ExternalInfo = {
            available: info.available === true,
            path: info.path?.trim() || undefined,
        };
        if (!aria2ExternalInfo.available) {
            aria2ExternalInfo.path = undefined;
        }
    }
    aria2cPathCache = undefined;
}

export function getAria2Info(): Readonly<Aria2Info> | null {
    return aria2ExternalInfo
        ? { available: aria2ExternalInfo.available, path: aria2ExternalInfo.path }
        : null;
}

async function resolveAria2cPath(): Promise<string | null> {
    if (aria2cPathCache !== undefined) return aria2cPathCache;

    if (aria2ExternalInfo) {
        if (!aria2ExternalInfo.available) {
            aria2cPathCache = null;
            return null;
        }
        if (aria2ExternalInfo.path) {
            aria2cPathCache = aria2ExternalInfo.path;
            Logger.log(`[Downloader] aria2c 使用外部配置：${aria2cPathCache}`);
            return aria2cPathCache;
        }
        // available=true 但未给路径：继续走 PATH 探测
    }

    const finder = process.platform === "win32" ? "where" : "which";
    try {
        const result = await execa(finder, ["aria2c"], {
            reject: false,
            windowsHide: true,
        });
        if (result.exitCode === 0) {
            const first = (result.stdout ?? "")
                .split(/\r?\n/)
                .map((s) => s.trim())
                .find(Boolean);
            if (first) {
                aria2cPathCache = first;
                Logger.log(`[Downloader] aria2c 可用：${aria2cPathCache}`);
                return aria2cPathCache;
            }
        }
    } catch (err) {
        Logger.warn(
            `[Downloader] 检测 aria2c 失败：${err instanceof Error ? err.message : String(err)}`,
        );
    }
    aria2cPathCache = null;
    return null;
}

// ─── GitHub 代理注入 ─────────────────────────────────────────

function isChinaTimeZone(): boolean {
    try {
        const tz = (
            Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
        ).toLowerCase();
        return (
            tz === "asia/shanghai" ||
            tz === "asia/chongqing" ||
            tz === "asia/harbin" ||
            tz === "asia/urumqi" ||
            tz === "asia/kashgar" ||
            tz === "prc"
        );
    } catch {
        return false;
    }
}

function shouldUseGithubProxy(opts: DownloadOptions): boolean {
    if (opts.isGithub !== true) return false;
    if (opts.isChina !== undefined) return opts.isChina;
    return isChinaTimeZone();
}

function buildGithubProxyUrl(
    proxy: GithubProxy,
    originalUrl: string,
): string | null {
    try {
        const parsed = new URL(originalUrl);
        if (parsed.hostname.toLowerCase() !== "github.com") return null;

        const base = proxy.baseUrl.replace(/\/+$/, "");
        if (proxy.mode === "prefix") {
            return `${base}/${originalUrl}`;
        }
        if (proxy.mode === "replace-origin") {
            return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
        return null;
    } catch {
        return null;
    }
}

function expandGithubSources(
    sources: readonly DownloadSource[],
    opts: DownloadOptions,
): DownloadSource[] {
    if (!shouldUseGithubProxy(opts)) return [...sources];

    const expanded: DownloadSource[] = [];
    const seen = new Set<string>();

    for (const proxy of GITHUB_PROXIES) {
        if (proxy.enabled === false) continue;
        for (const source of sources) {
            const url = buildGithubProxyUrl(proxy, source.url);
            if (!url) continue;

            const key = `${proxy.name}\u0000${url}`;
            if (seen.has(key)) continue;
            seen.add(key);

            expanded.push({
                url,
                label: source.label ? `${source.label} | ${proxy.name}` : proxy.name,
            });
        }
    }

    for (const source of sources) {
        const key = `original\u0000${source.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        expanded.push(source);
    }

    return expanded.length > 0 ? expanded : [...sources];
}

function buildSourceUAHeaders(
    source: DownloadSource,
    opts: DownloadOptions,
): Record<string, string> {
    return buildUserAgentHeaders(source.url, opts.isGithub === true);
}

// ─── aria2 进度解析 ────────────────────────────────────────

const SIZE_UNIT_MULT: Record<string, number> = {
    B: 1,
    KB: 1024,
    KIB: 1024,
    MB: 1024 ** 2,
    MIB: 1024 ** 2,
    GB: 1024 ** 3,
    GIB: 1024 ** 3,
    TB: 1024 ** 4,
    TIB: 1024 ** 4,
};

function parseSizeToken(value: string, unit: string): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    const mult = SIZE_UNIT_MULT[unit.toUpperCase()] ?? 1;
    return Math.round(n * mult);
}

function parseAria2Progress(line: string): DownloadProgressSnapshot | null {
    const mPercent = line.match(/\((\d+)%\)/);
    if (!mPercent) return null;
    const percent = Number(mPercent[1]);
    if (!Number.isFinite(percent)) return null;

    const mSize = line.match(
        /([\d.]+)\s*([KMGTP]?i?B)\s*\/\s*([\d.]+)\s*([KMGTP]?i?B)/i,
    );
    const transferredBytes = mSize ? parseSizeToken(mSize[1]!, mSize[2]!) : 0;
    const totalBytes = mSize ? parseSizeToken(mSize[3]!, mSize[4]!) : 0;

    const mSpeed = line.match(/DL:([\d.]+)\s*([KMGTP]?i?B)/i);
    const speed = mSpeed ? parseSizeToken(mSpeed[1]!, mSpeed[2]!) : undefined;

    const mEta = line.match(/ETA:(\d+)([smh])/i);
    let eta: number | undefined;
    if (mEta) {
        const n = Number(mEta[1]);
        const u = mEta[2]!.toLowerCase();
        eta = u === "s" ? n : u === "m" ? n * 60 : n * 3600;
    }

    return {
        transferredBytes,
        totalBytes,
        percent,
        speedBytesPerSecond: speed,
        etaSeconds: eta,
    };
}

// ─── aria2 后端 ────────────────────────────────────────────

async function aria2Download(opts: DownloadOptions): Promise<DownloadResult> {
    // 已中止的 signal 不应走到"起进程再杀进程"这一步。
    if (opts.signal?.aborted) throw abortError();

    const aria2c = await resolveAria2cPath();
    if (!aria2c) throw new Error("aria2c 不可达，无法使用 aria2 后端。");

    await ensureDir(dirname(opts.savePath));
    const existedBefore = await stat(opts.savePath)
        .then(() => true)
        .catch(() => false);

    if (existedBefore && (opts.skipExisting ?? true)) {
        const s = await stat(opts.savePath)
            .then((st) => st.size)
            .catch(() => 0);
        if (opts.rejectHtml) {
            await assertDownloadedFileNotHtml(opts.savePath);
        }
        return {
            url: opts.sources[0]!.url,
            savePath: opts.savePath,
            size: s,
            reused: true,
            source: opts.sources[0]!,
            backend: "aria2",
        };
    }

    const urlsFile = join(
        tmpdir(),
        `unigen-aria2-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
    );
    await writeFile(
        urlsFile,
        opts.sources.map((s) => s.url).join("\n") + "\n",
        "utf8",
    );

    const outDir = dirname(opts.savePath);
    const conns = String(Math.max(1, opts.parallelStreams ?? 3));

    const useGithubUa =
        opts.isGithub === true ||
        opts.sources.every((s) => shouldUseGithubBrowserUa(s.url));

    const args = [
        "-i", urlsFile,
        "-d", outDir,
        ...(useGithubUa ? [`--user-agent=${GITHUB_BROWSER_UA}`] : []),
        "-x", conns,
        "-s", conns,
        "-j", "1",
        "-c",
        "--allow-overwrite=false",
        "--auto-file-renaming=false",
        "--summary-interval=1",
        "--console-log-level=notice",
        "--show-console-readout=false",
        "--enable-color=false",
        "--no-conf",
    ];

    Logger.log(
        `[Downloader] aria2 多源下载 ${opts.sources.length} 个源 → ${opts.savePath}`,
    );

    // 取消由 execa 的 `cancelSignal` 承接：
    //   - POSIX：先 SIGTERM，`forceKillAfterDelay`（默认 5s）后 SIGKILL；
    //   - Windows：taskkill 终止进程树。
    // 比手动 `subprocess.kill("SIGTERM")` 更可靠：后者在 pid 尚未分配 /
    // aria2 不响应 SIGTERM 时会让取消静默失效，且没有强制升级手段。
    // 中止时 execa 的 promise 会 reject（与 `reject: false` 无关，
    // 该选项只影响非零退出码）。
    const subprocess = execa(aria2c, args, {
        reject: false,
        windowsHide: true,
        cancelSignal: opts.signal,
    });

    // 仅用于错误归因：区分"取消导致的非零退出"与"真实下载失败"。
    let aborted = false;
    const onAbort = () => {
        aborted = true;
    };
    if (opts.signal) {
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    if (opts.onProgress) {
        const cb = opts.onProgress;
        let acc = "";
        const handleChunk = (chunk: Buffer | string) => {
            acc += typeof chunk === "string" ? chunk : chunk.toString("utf8");
            const lines = acc.split(/\r|\n/);
            acc = lines.pop() ?? "";
            for (const line of lines) {
                const snap = parseAria2Progress(line);
                if (!snap) continue;
                try {
                    cb(snap);
                } catch (err) {
                    Logger.warn(
                        `[Downloader] aria2 进度回调异常：${errorMessage(err)}`,
                    );
                }
            }
        };
        subprocess.stdout?.on("data", handleChunk);
        subprocess.stderr?.on("data", handleChunk);
    }

    let lastError: unknown;
    let succeeded = false;
    try {
        const result = await subprocess;
        if (aborted || opts.signal?.aborted) {
            throw abortError();
        }
        if (result.exitCode !== 0) {
            throw new Error(
                `aria2c 退出码 ${result.exitCode}：${(result.stderr || result.stdout || "").trim() || "未知错误"}`,
            );
        }
        succeeded = true;
    } catch (err) {
        lastError = err;
    } finally {
        opts.signal?.removeEventListener("abort", onAbort);
        await rm(urlsFile, { force: true }).catch(() => undefined);
    }

    if (!succeeded) {
        if (aborted || opts.signal?.aborted) throw abortError();
        if (lastError instanceof Error) throw lastError;
        throw new Error("aria2 下载失败。");
    }

    const actual = join(outDir, basename(new URL(opts.sources[0]!.url).pathname));
    let finalPath = opts.savePath;
    if (actual !== opts.savePath) {
        try {
            await stat(actual);
            await rm(opts.savePath, { force: true }).catch(() => undefined);
            await ensureDir(dirname(opts.savePath));
            await rename(actual, opts.savePath);
        } catch {
            finalPath = actual;
        }
    }

    const fileStat = await stat(finalPath).catch(() => null);
    if (!fileStat) {
        throw new Error(`aria2c 完成但未找到输出文件：${finalPath}`);
    }

    if (opts.rejectHtml) {
        await assertDownloadedFileNotHtml(finalPath);
    }

    return {
        url: opts.sources[0]!.url,
        savePath: finalPath,
        size: fileStat.size,
        reused: existedBefore,
        source: opts.sources[0]!,
        backend: "aria2",
    };
}

// ─── fetch 后端 ────────────────────────────────────────────

/**
 * 单次 HTTP 请求 + 有限重试。
 *
 * 只重试"拿到响应头之前"的失败与 429 / 503：
 *   - 网络异常（DNS / 连接被拒 / TLS）；
 *   - 5xx（含 429 / 503，带 Retry-After 时按指示等待）；
 * 一旦拿到 200 / 206 响应开始流式读盘，任何中途错误都不重试
 * （续传在下次整个源尝试时通过 `Range` 处理）。
 *
 * 退避等待通过 `sleep(ms, signal)` 中断：取消后不必等退避窗口结束。
 */
async function fetchWithRetry(
    url: string,
    headers: Record<string, string>,
    signal: AbortSignal | undefined,
): Promise<Response> {
    let lastErr: unknown;

    for (let attempt = 1; attempt <= FETCH_MAX_RETRIES; attempt++) {
        if (signal?.aborted) throw abortError();

        let res: Response;
        try {
            res = await fetch(url, {
                method: "GET",
                headers,
                signal,
                redirect: "follow",
            });
        } catch (err) {
            if (isAbortError(err, signal)) throw err;
            lastErr = err;
            if (attempt >= FETCH_MAX_RETRIES) break;
            const delay = Math.min(1_000 * attempt, RETRY_MAX_DELAY_MS);
            Logger.warn(
                `[Downloader] 请求异常：${url}：${errorMessage(err)}；` +
                `${delay}ms 后重试（${attempt}/${FETCH_MAX_RETRIES}）`,
            );
            await sleep(delay, signal);
            continue;
        }

        if (res.status === 429 || res.status === 503) {
            const retryAfter = res.headers.get("retry-after");
            let delay = Math.min(1_000 * attempt, RETRY_MAX_DELAY_MS);
            if (retryAfter) {
                const n = Number(retryAfter);
                if (Number.isFinite(n) && n > 0) {
                    delay = Math.min(n * 1000, RETRY_MAX_DELAY_MS);
                }
            }
            await safeBodyCancel(res);
            if (attempt >= FETCH_MAX_RETRIES) {
                throw new Error(
                    `HTTP ${res.status} ${res.statusText || ""}`.trim(),
                );
            }
            Logger.warn(
                `[Downloader] ${url} 返回 ${res.status}，${delay}ms 后重试` +
                `（${attempt}/${FETCH_MAX_RETRIES}）`,
            );
            await sleep(delay, signal);
            continue;
        }

        return res;
    }

    if (lastErr instanceof Error) throw lastErr;
    throw new Error(`下载请求重试耗尽：${url}`);
}

function parseContentRangeTotal(
    value: string | null,
): { start: number; total: number | null } | null {
    if (!value) return null;
    const m = value.match(/bytes\s+(\d+)-\d+\/(\d+|\*)/i);
    if (!m) return null;
    return {
        start: Number(m[1]),
        total: m[2] === "*" ? null : Number(m[2]),
    };
}

function parseContentRangeStarTotal(value: string | null): number | null {
    if (!value) return null;
    const m = value.match(/bytes\s+\*\/(\d+)/i);
    if (!m) return null;
    return Number(m[1]);
}

async function fetchSingleSource(
    source: DownloadSource,
    opts: DownloadOptions,
): Promise<DownloadResult> {
    const savePath = opts.savePath;
    const wantSkipExisting = opts.skipExisting ?? true;
    const baseHeaders = buildSourceUAHeaders(source, opts);

    // 1. 决定续传起点 / 检查已有文件是否可疑
    let startAt = 0;
    if (wantSkipExisting) {
        const existing = await stat(savePath).catch(() => null);
        if (existing && existing.size > 0) {
            startAt = existing.size;

            // 已有文件若是 HTML 拦截页，删掉从头下载（否则续传会
            // 追加到坏文件后面）
            if (opts.rejectHtml) {
                try {
                    await assertFileNotHtml(savePath);
                } catch (err) {
                    Logger.warn(
                        `[Downloader] 已有文件疑似 HTML 拦截页，删除后重新下载：` +
                        `${savePath}（${errorMessage(err)}）`,
                    );
                    await rm(savePath, { force: true }).catch(() => undefined);
                    startAt = 0;
                }
            }
        }
    }

    // 2. 发请求（带 Range）
    const reqHeaders: Record<string, string> = { ...baseHeaders };
    if (startAt > 0) {
        reqHeaders["Range"] = `bytes=${startAt}-`;
    }

    const res = await fetchWithRetry(source.url, reqHeaders, opts.signal);

    // 3. 416：Range Not Satisfiable（续传语义）
    if (res.status === 416 && startAt > 0) {
        const remoteTotal = parseContentRangeStarTotal(
            res.headers.get("content-range"),
        );
        await safeBodyCancel(res);

        if (remoteTotal !== null && remoteTotal === startAt) {
            Logger.debug(
                `[Downloader] fetch 续传跳过（本地大小与远端一致）：${savePath}`,
            );
            return {
                url: source.url,
                savePath,
                size: startAt,
                reused: true,
                source,
                backend: "fetch",
            };
        }

        Logger.warn(
            `[Downloader] 已有文件与远端大小不匹配（本地 ${startAt}，远端 ${remoteTotal ?? "?"}）；` +
            `删除并从头下载：${savePath}`,
        );
        await rm(savePath, { force: true }).catch(() => undefined);
        return fetchSingleSource(source, { ...opts, skipExisting: false });
    }

    // 4. 常规错误码
    if (!res.ok && res.status !== 206) {
        await safeBodyCancel(res);
        throw new Error(
            `HTTP ${res.status} ${res.statusText || ""}`.trim(),
        );
    }

    // 5. 判定追加 / 覆盖模式并解析远端大小
    let appendMode = false;
    let totalBytes = 0;
    let resolvedStartAt = 0;

    if (startAt > 0) {
        if (res.status === 206) {
            const cr = parseContentRangeTotal(
                res.headers.get("content-range"),
            );
            if (cr) {
                if (cr.start !== startAt) {
                    await safeBodyCancel(res);
                    throw new Error(
                        `Content-Range 起点不符：期望 ${startAt}，实际 ${cr.start}`,
                    );
                }
                appendMode = true;
                resolvedStartAt = startAt;
                if (cr.total !== null) totalBytes = cr.total;
            } else {
                // 无 Content-Range 的 206：信任服务器
                appendMode = true;
                resolvedStartAt = startAt;
            }
        } else if (res.status === 200) {
            // 服务器忽略 Range：从 0 覆盖
            appendMode = false;
            resolvedStartAt = 0;
        }
    }

    if (totalBytes === 0) {
        const lenHeader = res.headers.get("content-length");
        if (lenHeader) {
            const len = Number(lenHeader);
            if (Number.isFinite(len) && len > 0) {
                totalBytes = appendMode ? resolvedStartAt + len : len;
            }
        }
    }

    // 6. 拦截页快速拒绝：看到 text/html 且用户要求 reject 时，
    //    在写盘之前就撤销响应，避免污染目标文件。
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (opts.rejectHtml && contentType.includes("text/html")) {
        await safeBodyCancel(res);
        await rm(savePath, { force: true }).catch(() => undefined);
        throw new Error(
            "下载内容为 HTML 拦截页（代理被限流或 UA 被识别），" +
            `源：${source.label ?? source.url}`,
        );
    }

    // 7. skipExisting + 已完整：直接返回
    if (
        appendMode &&
        totalBytes > 0 &&
        resolvedStartAt === totalBytes
    ) {
        await safeBodyCancel(res);
        return {
            url: source.url,
            savePath,
            size: resolvedStartAt,
            reused: true,
            source,
            backend: "fetch",
        };
    }

    // 8. 落盘
    const body = res.body;
    if (!body) {
        throw new Error("下载响应无 body");
    }

    await ensureDir(dirname(savePath));
    const handle = await open(savePath, appendMode ? "a" : "w");
    const reader = body.getReader();

    let transferred = resolvedStartAt;
    let lastEmit = 0;
    const progressCb = opts.onProgress;

    const emitProgress = (force: boolean) => {
        if (!progressCb) return;
        const now = Date.now();
        if (!force && now - lastEmit < PROGRESS_THROTTLE_MS) return;
        lastEmit = now;
        const percent =
            totalBytes > 0
                ? Math.max(0, Math.min(100, (transferred / totalBytes) * 100))
                : 0;
        try {
            progressCb({
                transferredBytes: transferred,
                totalBytes,
                percent,
            });
        } catch (err) {
            Logger.warn(
                `[Downloader] fetch 进度回调异常：${errorMessage(err)}`,
            );
        }
    };

    try {
        while (true) {
            let read;
            try {
                read = await reader.read();
            } catch (err) {
                // 中断 / 网络异常：显式取消流，避免半关闭；
                // 部分文件保留用于下次续传。
                await reader.cancel().catch(() => undefined);
                throw err;
            }
            if (read.done) break;
            const value = read.value;
            if (!value || value.byteLength === 0) continue;
            await handle.write(value);
            transferred += value.byteLength;
            emitProgress(false);
        }
        emitProgress(true);
    } finally {
        await handle.close().catch(() => undefined);
    }

    // 9. 完成后校验
    if (opts.rejectHtml) {
        await assertDownloadedFileNotHtml(savePath);
    }

    const finalStat = await stat(savePath);
    const contentEncoding = (
        res.headers.get("content-encoding") ?? ""
    ).toLowerCase();
    const encoded = contentEncoding !== "" && contentEncoding !== "identity";

    if (!encoded && totalBytes > 0 && finalStat.size !== totalBytes) {
        // 大小不匹配通常意味着服务端返回了错误内容；删除后抛错让
        // 调用方 failover 到下一源重下。
        await rm(savePath, { force: true }).catch(() => undefined);
        throw new Error(
            `下载完成但大小不匹配：期望 ${totalBytes}，实际 ${finalStat.size}` +
            `（已删除，下次将从头下载）`,
        );
    }

    Logger.debug(
        `[Downloader] fetch 下载完成：${savePath}` +
        `（${finalStat.size} 字节，源 ${source.label ?? source.url}）`,
    );

    return {
        url: source.url,
        savePath,
        size: finalStat.size,
        // 走到这里一定发生了"写盘"（无论覆盖还是追加）：
        // 命中已有文件的两个分支已在上面显式 return reused: true。
        // 旧实现在此用 `finalStat.size === 0` 反推"未重新下载"，会把
        // "服务器返回空内容 / 下载被清空"误标成复用，属于逻辑错误。
        reused: false,
        source,
        backend: "fetch",
    };
}

async function fetchDownload(opts: DownloadOptions): Promise<DownloadResult> {
    await ensureDir(dirname(opts.savePath));

    const failoverOnError = opts.failoverOnError ?? true;
    let lastError: unknown;

    for (let i = 0; i < opts.sources.length; i += 1) {
        const source = opts.sources[i]!;
        if (opts.signal?.aborted) {
            throw abortError(`下载已被取消：${source.url}`);
        }
        try {
            if (opts.onSourceChange) {
                callSafely("onSourceChange", () => opts.onSourceChange!(source, i));
            }
            Logger.debug(
                `[Downloader] fetch 尝试源 ${i + 1}/${opts.sources.length}：` +
                `${source.label ?? source.url}`,
            );
            return await fetchSingleSource(source, opts);
        } catch (err) {
            lastError = err;

            if (isAbortError(err, opts.signal)) throw err;

            if (isLocalFsError(err)) {
                Logger.error(
                    `[Downloader] 本地文件系统错误（与下载源无关，终止重试）：` +
                    `${errorMessage(err)}（savePath=${opts.savePath}）`,
                );
                throw err;
            }

            if (!failoverOnError) throw err;

            Logger.warn(
                `[Downloader] 源失败：${source.label ?? source.url}` +
                `（${errorMessage(err)}）；尝试下一个源（${i + 1}/${opts.sources.length}）。`,
            );
        }
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error("所有下载源均失败。");
}

// ─── 统一入口 ──────────────────────────────────────────────

/**
 * 多源下载主入口。
 *
 * 语义：
 *   - 默认后端为 **fetch**（Node.js 内置，稳定性优先）；
 *   - 指定 `backend: "auto"` 或 `"aria2"` 时才会探测 aria2c；
 *     `auto` 在 aria2 失败时自动回退 fetch；
 *   - `isGithub + isChina` 时自动注入 github 代理，并把代理放在原始源之前；
 *   - aria2 失败后默认回退到 fetch 完整执行一次 failover；
 *     **取消不属于"失败"**，不会回退（否则会用同一个已中止的 signal
 *     再跑一遍必然立即失败的流程，既浪费又污染错误归因）；
 *   - 调用方应先 `probeUrls + sortByLatency` 排好 `sources` 顺序；
 *     本函数按 `sources` 顺序尝试（failover）；
 *   - **本机文件系统错误不会触发 failover**。
 */
export async function download(opts: DownloadOptions): Promise<DownloadResult> {
    if (opts.sources.length === 0) {
        throw new Error("download: sources 为空。");
    }
    if (opts.signal?.aborted) {
        throw abortError();
    }

    const githubProxyUsed = shouldUseGithubProxy(opts);
    const effectiveSources = expandGithubSources(opts.sources, opts);
    const rejectHtml = opts.rejectHtml ?? githubProxyUsed;
    const effectiveOpts: DownloadOptions = {
        ...opts,
        sources: effectiveSources,
        rejectHtml,
    };

    // 运行时归一化：外部（如 JS 调用 / 旧持久化数据）可能传入历史 / 非法值，
    // 统一退化为 fetch。
    const backend: "auto" | "fetch" | "aria2" =
        opts.backend === "auto" || opts.backend === "aria2"
            ? opts.backend
            : "fetch";

    Logger.debug(
        `[Downloader] download 开始：sources=${effectiveSources.length} ` +
        `savePath=${opts.savePath} backend=${backend} rejectHtml=${rejectHtml}`,
    );

    const aria2 =
        backend === "aria2" || backend === "auto"
            ? await resolveAria2cPath()
            : null;

    if (backend === "aria2" && !aria2) {
        if ((opts.fallbackToFetchOnAria2Error ?? true) === false) {
            throw new Error("download: 指定 aria2 后端但 aria2c 不可用。");
        }
        Logger.warn("[Downloader] aria2 不可用，回退到 fetch。");
        return fetchDownload(effectiveOpts);
    }

    if (aria2) {
        try {
            return await aria2Download(effectiveOpts);
        } catch (err) {
            // 取消不是"后端失败"：回退 fetch 只会用同一个已中止的
            // signal 再走一遍，最终仍以取消结束，纯属额外开销。
            if (isAbortError(err, opts.signal)) throw err;
            if ((opts.fallbackToFetchOnAria2Error ?? true) === false) throw err;
            Logger.warn(
                `[Downloader] aria2 失败，回退到 fetch：${errorMessage(err)}`,
            );
        }
    }

    return fetchDownload(effectiveOpts);
}