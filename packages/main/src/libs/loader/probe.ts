// packages/main/src/libs/loader/probe.ts
//
// 通用 URL 探测 / 测速。**仅负责探测**，与下载器完全解耦。
//
// 语义：
//   - 每个 URL 独立探测；失败 / 超时返回 latencyMs = Infinity；
//   - `sortByLatency` 把可达源按 RTT 升序排；不可达源保留原始顺序
//     并挪到最后（作为最后尝试的 fallback）；
//   - 调用方若需要可进一步按需过滤。

export interface ProbeOptions {
    /** 单个 URL 的探测超时（毫秒），默认 8000。 */
    timeoutMs?: number;
    /** 外部取消信号。 */
    signal?: AbortSignal;
    /** 附加请求头。 */
    headers?: Record<string, string>;
    /**
     * 探测方式。
     *   - `GET_RANGE`（默认）：发 `Range: bytes=0-0`，读 1 字节。兼容性最好；
     *   - `HEAD`：HEAD 请求。部分镜像对 HEAD 支持不稳定，慎用。
     */
    method?: "GET_RANGE" | "HEAD";
}

export interface ProbeResult {
    url: string;
    /** 成功时 = RTT 毫秒；失败 / 超时 = Infinity。 */
    latencyMs: number;
    reachable: boolean;
    status?: number;
    error?: string;
}

export async function probeOne(
    url: string,
    opts: ProbeOptions = {},
): Promise<ProbeResult> {
    const timeoutMs = opts.timeoutMs ?? 8_000;
    const method = opts.method ?? "GET_RANGE";
    const ac = new AbortController();

    let externalAbortHandler: (() => void) | undefined;
    if (opts.signal) {
        if (opts.signal.aborted) {
            return {
                url,
                latencyMs: Infinity,
                reachable: false,
                error: "aborted",
            };
        }
        externalAbortHandler = () => ac.abort();
        opts.signal.addEventListener("abort", externalAbortHandler, {
            once: true,
        });
    }

    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const start = Date.now();
    try {
        const headers: Record<string, string> = { ...(opts.headers ?? {}) };
        if (method === "GET_RANGE" && !headers.Range && !headers.range) {
            headers.Range = "bytes=0-0";
        }
        const res = await fetch(url, {
            method: method === "HEAD" ? "HEAD" : "GET",
            headers,
            signal: ac.signal,
            redirect: "follow",
        });
        if (!res.ok && res.status !== 206) {
            throw new Error(`HTTP ${res.status}`);
        }
        if (method === "GET_RANGE" && res.body) {
            const reader = res.body.getReader();
            await reader.read();
            await reader.cancel().catch(() => undefined);
        }
        return {
            url,
            latencyMs: Date.now() - start,
            reachable: true,
            status: res.status,
        };
    } catch (err) {
        return {
            url,
            latencyMs: Infinity,
            reachable: false,
            error: err instanceof Error ? err.message : String(err),
        };
    } finally {
        clearTimeout(timer);
        if (opts.signal && externalAbortHandler) {
            opts.signal.removeEventListener("abort", externalAbortHandler);
        }
    }
}

/** 并发探测全部 URL；顺序与输入一致。 */
export async function probeUrls(
    urls: readonly string[],
    opts: ProbeOptions = {},
): Promise<ProbeResult[]> {
    return Promise.all(urls.map((u) => probeOne(u, opts)));
}

/**
 * 稳定排序：可达源按 RTT 升序；不可达源保留原始顺序并放最后。
 */
export function sortByLatency(results: readonly ProbeResult[]): ProbeResult[] {
    const indexed = results.map((r, i) => ({ r, i }));
    indexed.sort((a, b) => {
        if (a.r.latencyMs === b.r.latencyMs) return a.i - b.i;
        if (a.r.latencyMs === Infinity) return 1;
        if (b.r.latencyMs === Infinity) return -1;
        return a.r.latencyMs - b.r.latencyMs;
    });
    return indexed.map((x) => x.r);
}