import Logger from "electron-log/main.js";
import pTimeout from "p-timeout";

import { secondConfig } from "$libs/store/second.js";
import type { SecondConfig } from "$types/appconfig.js";

/**
 * 中国区检测。
 *
 * 用途：决定下载服务器、镜像源（uv / npm / pip / node dist）。
 *
 * 策略：
 * - 使用 Promise.any 并发竞速多个支持返回国家代码的端点；
 * - 整体最长等待 3 秒，超时或全部失败时保守视为中国；
 * - 成功检测后把国家代码与检测时间写入 secondConfig；
 * - 启动时若缓存未超过 7 天，直接使用缓存，不发起网络请求；
 * - 超时/失败不更新检测时间，下次启动继续检测。
 */

const PROBE_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7天缓存有效期。
const CHINA_COUNTRY_CODES = new Set(["CN"]);
const COUNTRY_CODE_RE = /^[A-Za-z]{2}$/;

type JsonRecord = Record<string, unknown>;

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): JsonRecord | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as JsonRecord)
        : undefined;
}

function readRecord(
    record: JsonRecord | undefined,
    key: string,
): JsonRecord | undefined {
    return asRecord(record?.[key]);
}

function normalizeCountryCode(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;

    const code = value.trim().toUpperCase();
    return COUNTRY_CODE_RE.test(code) ? code : undefined;
}

function requireCountryCode(value: unknown, source: string): string {
    const code = normalizeCountryCode(value);
    if (!code) {
        throw new Error(`${source} 未返回有效国家代码`);
    }
    return code;
}

function isChinaCountryCode(code: string): boolean {
    return CHINA_COUNTRY_CODES.has(code.trim().toUpperCase());
}

function isCacheFresh(
    cache: SecondConfig["ipCountry"],
    now: number,
): boolean {
    if (!normalizeCountryCode(cache.code)) return false;

    const age = now - cache.checkedAt;
    return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS;
}

async function fetchJson(
    url: string,
    signal: AbortSignal,
): Promise<unknown> {
    const response = await fetch(url, {
        signal,
        headers: {
            accept: "application/json",
        },
    });

    if (!response.ok) {
        throw new Error(`${url} HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * 仅保留能返回国家代码的端点。
 *
 * 注意：https://ifconfig.me/all.json 的响应不包含国家代码，
 * 无法用于“只检测国家代码”的目标，因此不纳入竞速列表。
 */
const COUNTRY_PROBES: ReadonlyArray<
    (signal: AbortSignal) => Promise<string>
> = [
        async (signal) => {
            const json = asRecord(
                await fetchJson("https://ifconfig.co/json", signal),
            );
            return requireCountryCode(json?.country_iso, "ifconfig.co");
        },

        async (signal) => {
            const json = asRecord(
                await fetchJson("https://ipinfo.io/json", signal),
            );
            return requireCountryCode(json?.country, "ipinfo.io");
        },

        async (signal) => {
            const json = asRecord(await fetchJson("https://ipwho.is/", signal));
            if (json?.success === false) {
                throw new Error("ipwho.is success=false");
            }
            return requireCountryCode(json?.country_code, "ipwho.is");
        },

        async (signal) => {
            const json = asRecord(
                await fetchJson("https://ip.nc.gy/json", signal),
            );
            const country = readRecord(json, "country");
            return requireCountryCode(country?.iso_code, "ip.nc.gy");
        },

        async (signal) => {
            const json = asRecord(
                await fetchJson("https://ip9.com.cn/get", signal),
            );
            const data = readRecord(json, "data");
            return requireCountryCode(data?.country_code, "ip9.com.cn");
        },
    ];

async function detectCountryCode(): Promise<string> {
    const controller = new AbortController();

    try {
        return await pTimeout(
            Promise.any(
                COUNTRY_PROBES.map((probe) => probe(controller.signal)),
            ),
            {
                milliseconds: PROBE_TIMEOUT_MS,
                message: `IP 国家检测超过 ${PROBE_TIMEOUT_MS}ms`,
            },
        );
    } finally {
        // 成功时中止其余探测请求；超时时中止所有未完成请求。
        controller.abort();
    }
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
                const now = Date.now();
                const cached = this.readCachedCountry();

                if (cached && isCacheFresh(cached, now)) {
                    this.#inChina = isChinaCountryCode(cached.code);
                    return;
                }

                const code = await detectCountryCode();
                this.#inChina = isChinaCountryCode(code);

                try {
                    secondConfig().set("ipCountry", {
                        code,
                        checkedAt: Date.now(),
                    });
                } catch (error) {
                    Logger.warn(
                        `[IPInfo] 写入国家检测缓存失败：${formatError(error)}`,
                    );
                }
            } catch (error) {
                // 超时或全部端点失败：保守视为中国，且不更新检测时间。
                this.#inChina = true;
                Logger.warn(
                    `[IPInfo] 国家检测失败或超时，暂按中国处理且不更新缓存：${formatError(error)}`,
                );
            } finally {
                this.#inited = true;
                this.#initPromise = null;
            }
        })();

        return this.#initPromise;
    }

    private readCachedCountry(): SecondConfig["ipCountry"] | undefined {
        try {
            return secondConfig().get("ipCountry");
        } catch (error) {
            Logger.warn(
                `[IPInfo] 读取国家检测缓存失败：${formatError(error)}`,
            );
            return undefined;
        }
    }
}

const KEY = Symbol.for("unigen.singleton.ip");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ipInfo: IPInfo = ((globalThis as any)[KEY] ??= new IPInfo());