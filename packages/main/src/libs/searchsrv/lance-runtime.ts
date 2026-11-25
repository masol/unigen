// lance-runtime.ts
import { dataCenter } from "$libs/utils/sys/data.js";
import Logger from "electron-log/main.js";
import { pathExists } from "fs-extra";
import { join } from "node:path";

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

/**
 * LanceDB 语言模型根目录。
 *
 * 使用发行包 / 数据目录中的只读资源，而不是 userData 下的可写副本：
 * tokenizer 字典随应用发布，版本与 LanceDB 版本一起管理。
 */
export function getLanguageModelHome(): string {
    return dataCenter.pathInRes("lancedb");
}

/**
 * Jieba tokenizer 模型目录。
 *
 * LanceDB 以 `jieba/default` 作为 tokenizer 名，会从
 * `LANCE_LANGUAGE_MODEL_HOME/jieba/default` 查找模型。
 */
export function getJiebaTokenizerDir(): string {
    return join(getLanguageModelHome(), "jieba", "default");
}

async function probeJiebaTokenizer(): Promise<boolean> {
    const state = getJiebaAvailability();
    if (state.available !== null) return state.available;
    if (state.probe) return state.probe;

    state.probe = (async () => {
        try {
            const dir = getJiebaTokenizerDir();
            const available = await pathExists(dir);
            state.available = available;

            if (!available) {
                Logger.warn(
                    `[Search] Jieba tokenizer 模型目录不存在，fts_tokenizer=jieba 时将回退: ${dir}`,
                );
            }

            return available;
        } catch (error) {
            state.available = false;
            Logger.warn(
                "[Search] 检查 Jieba tokenizer 模型目录失败，fts_tokenizer=jieba 时将回退。",
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

/**
 * 强制重新探测 Jieba 模型目录。
 *
 * 重设 FTS 索引前调用，允许运行期间更新 / 安装模型目录后立即生效，
 * 而不是等下一次进程启动。
 */
export async function refreshJiebaTokenizerAvailability(): Promise<boolean> {
    const state = getJiebaAvailability();
    const running = state.probe;

    if (running) {
        await running.catch(() => false);
    }

    state.available = null;
    state.probe = null;

    return probeJiebaTokenizer();
}

export async function getLanceRuntime(): Promise<LanceRuntime> {
    const g = globalThis as unknown as Record<symbol, LanceRuntime | undefined>;
    const cached = g[RUNTIME_KEY];
    if (cached) {
        return cached;
    }

    // 只使用 LanceDB 的原生连接 / 查询 / 索引 API。
    // 不引用 @lancedb/lancedb/embedding，因此不依赖可选包 onnxruntime-node。
    process.env.LANCE_LANGUAGE_MODEL_HOME = getLanguageModelHome();

    await probeJiebaTokenizer();
    const runtime = await import("@lancedb/lancedb");
    g[RUNTIME_KEY] = runtime;

    return runtime;
}