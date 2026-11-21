// 中国区检测（低频、缓存型配置）。
//
// 说明：
// - 该模块只导出一个检查函数，不再提供可变的全局 ipInfo 单例；
// - 检测结果扁平化写入 stableConfig.isChina；
// - 不保存国家代码，仅保留 isChina 与最近成功检测时间戳；
// - 为避免递归依赖，stableConfig 不反向依赖本模块，由 UnigenModule 在启动期调用。

import Logger from "electron-log/main.js";
import pTimeout from "p-timeout";
import { stableConfig } from "./stable.js";

const PROBE_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天缓存有效期。
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

let inFlight: Promise<boolean> | null = null;

/**
 * 检查并更新 stableConfig.isChina。
 *
 * - 命中 7 天缓存时直接返回缓存值；
 * - 检测成功时写入 isChina 与 isChinaCheckedAt；
 * - 检测失败/超时时保守视为中国，但不更新 isChinaCheckedAt，以便下次启动重试。
 */
export function checkAndUpdateIsChina(): Promise<boolean> {
    if (inFlight) return inFlight;

    const promise = (async (): Promise<boolean> => {
        const store = stableConfig();
        const now = Date.now();
        const checkedAt = store.get("isChinaCheckedAt");
        const cachedIsChina = store.get("isChina");

        if (checkedAt > 0 && now >= checkedAt && now - checkedAt < CACHE_TTL_MS) {
            return cachedIsChina;
        }

        try {
            const code = await detectCountryCode();
            const isChina = isChinaCountryCode(code);

            try {
                store.set("isChina", isChina);
                store.set("isChinaCheckedAt", Date.now());
            } catch (error) {
                Logger.warn(
                    `[IPInfo] 写入区域检测缓存失败：${formatError(error)}`,
                );
            }

            return isChina;
        } catch (error) {
            // 超时或全部端点失败：保守视为中国，且不更新检测时间。
            try {
                store.set("isChina", true);
            } catch (persistError) {
                Logger.warn(
                    `[IPInfo] 写入保守区域状态失败：${formatError(persistError)}`,
                );
            }

            Logger.warn(
                `[IPInfo] 国家检测失败或超时，暂按中国处理且不更新缓存：${formatError(error)}`,
            );
            return true;
        }
    })();

    inFlight = promise.finally(() => {
        inFlight = null;
    });
    return inFlight;
}