import Logger from "electron-log/main.js";

/**
 * 中国区检测。
 *
 * 用途：决定下载服务器、镜像源（uv / npm / pip / node dist）。
 * 保守缺省：**探测失败视为中国**（`inChina = true`），
 * 这符合大多数国内用户的使用习惯（国外用户失败概率极低但代价是走国内镜像，通常也能连通）。
 */

const PROBE_TIMEOUT_MS = 3000;
const CHINA_ALIASES = new Set(["china", "cn", "中国", "prc"]);

async function fetchWithTimeout(
    url: string,
    timeoutMs: number,
): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } catch (error) {
        Logger.warn(
            `[IPInfo] 查询失败 ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function getCountry(): Promise<string | null> {
    // 主端点：ip.nc.gy/country（返回国家名称文本）
    const primary = await fetchWithTimeout(
        "http://ip.nc.gy/country",
        PROBE_TIMEOUT_MS,
    );
    if (primary?.ok) {
        try {
            const text = (await primary.text()).trim();
            if (text) return text;
        } catch (error) {
            Logger.warn(
                `[IPInfo] 主端点响应解析失败：${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    // 回退：ip-api.com（免费版仅 http）
    const fallback = await fetchWithTimeout(
        "http://ip-api.com/json/",
        PROBE_TIMEOUT_MS,
    );
    if (fallback?.ok) {
        try {
            const json = (await fallback.json()) as {
                status?: string;
                country?: string;
            };
            if (json?.status === "success" && typeof json.country === "string" && json.country) {
                return json.country;
            }
        } catch (error) {
            Logger.warn(
                `[IPInfo] 回退端点响应解析失败：${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    return null;
}

function isChinaName(name: string): boolean {
    return CHINA_ALIASES.has(name.trim().toLowerCase());
}

async function detectInChina(): Promise<boolean> {
    const country = await getCountry();
    if (!country) {
        // 探测失败：保守视为中国。
        return true;
    }
    return isChinaName(country);
}

export class IPInfo {
    #inChina = true;
    #inited = false;
    #initPromise: Promise<void> | null = null;

    get inChina(): boolean {
        return this.#inChina;
    }

    get inited(): boolean {
        return this.#inited;
    }

    /** 幂等初始化；重复调用复用同一 promise。 */
    init(): Promise<void> {
        if (this.#inited) return Promise.resolve();
        if (this.#initPromise) return this.#initPromise;

        this.#initPromise = (async () => {
            try {
                this.#inChina = await detectInChina();
            } catch (error) {
                Logger.warn(
                    `[IPInfo] 初始化失败，退化为 inChina=true：${error instanceof Error ? error.message : String(error)}`,
                );
                this.#inChina = true;
            } finally {
                this.#inited = true;
                this.#initPromise = null;
            }
        })();
        return this.#initPromise;
    }
}


const KEY = Symbol.for('unigen.singleton.ip');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ipInfo: IPInfo = ((globalThis as any)[KEY] ??= new IPInfo());