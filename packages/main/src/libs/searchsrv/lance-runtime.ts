// lance-runtime.ts
import { lanceModelDir } from "$libs/utils/sys/dir.js";
import Logger from "electron-log/main.js";
import { pathExists } from "fs-extra";

export type LanceRuntime = Awaited<typeof import("@lancedb/lancedb")>;

const RUNTIME_KEY = Symbol.for("unigen.singleton.globalLanceRuntime");
const JIEBA_KEY = Symbol.for("unigen.singleton.jiebaTokenizerAvailability");

interface JiebaAvailability {
    available: boolean | null;
    probe: Promise<boolean> | null;
}

function getJiebaAvailability(): JiebaAvailability {
    const g = globalThis as unknown as Record<
        symbol,
        JiebaAvailability | undefined
    >;
    return (g[JIEBA_KEY] ??= { available: null, probe: null });
}

async function probeJiebaTokenizer(): Promise<boolean> {
    const state = getJiebaAvailability();
    if (state.available !== null) return state.available;
    if (state.probe) return state.probe;

    state.probe = (async () => {
        try {
            const dir = lanceModelDir("jieba", "default");
            const available = await pathExists(dir);
            state.available = available;

            if (!available) {
                Logger.warn(
                    `[Search] Jieba tokenizer 模型目录不存在，FTS 将使用 icu: ${dir}`,
                );
            }

            return available;
        } catch (error) {
            state.available = false;
            Logger.warn(
                "[Search] 检查 Jieba tokenizer 模型目录失败，FTS 将使用 icu。",
                error,
            );
            return false;
        } finally {
            state.probe = null;
        }
    })();

    return state.probe;
}

/**
 * 同步读取 Jieba tokenizer 是否可用。
 *
 * 仅在 getLanceRuntime() 完成探测后返回准确值；探测未完成时返回 false，
 * 调用方降级为 icu，不会触发报错。
 */
export function isJiebaTokenizerAvailable(): boolean {
    return getJiebaAvailability().available === true;
}

export async function getLanceRuntime(): Promise<LanceRuntime> {
    const g = globalThis as unknown as Record<symbol, LanceRuntime | undefined>;
    const cached = g[RUNTIME_KEY];
    if (cached) {
        return cached;
    }

    process.env.LANCE_LANGUAGE_MODEL_HOME = lanceModelDir();

    await probeJiebaTokenizer();
    const runtime = await import("@lancedb/lancedb");
    g[RUNTIME_KEY] = runtime;

    await probeJiebaTokenizer();
    return runtime;
}