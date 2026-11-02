import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import type {
    JsonValue, ModelSelectOptions, PacFrontMatter,
    PacTimeoutConfig, ResolvedSettings,
} from "./type.js";

/**
 * PAC 的"集中设置"分三类:
 *
 *  1) 编译期常量(resolveSettings)
 *     front matter 中的开关 → ResolvedSettings。
 *     默认值可直接工作,所有开关都有合理 fallback。
 *
 *  2) 编译期默认值(resolveOwnDefaults)
 *     front matter.setDefault → _T_ 变量默认值表。
 *
 *  3) 运行期可变(resolveModelOptions)
 *     prjDB.get("model") → getSmartModel 的 options。
 *     对所有层级(含子 agent)生效。
 */

/**
 * 默认值:
 *   history: null → 加载全部历史。工具型子 agent 建议显式声明 history: 0 关闭,
 *            避免结构化 JSON user 消息无限累积。
 *   timeout: undefined → 使用 provider 默认。
 */
const DEFAULTS: ResolvedSettings = {
    maxSteps: 10,
    streaming: true,
    thinking: true,
    history: null,
    timeout: undefined,
};

/** FM 常量开关 → ResolvedSettings。未知/非法字段用默认值。 */
export function resolveSettings(fm: PacFrontMatter): ResolvedSettings {
    const maxSteps =
        typeof fm.maxSteps === "number" && Number.isFinite(fm.maxSteps) && fm.maxSteps > 0
            ? Math.floor(fm.maxSteps)
            : DEFAULTS.maxSteps;

    const streaming = typeof fm.streaming === "boolean" ? fm.streaming : DEFAULTS.streaming;
    const thinking = typeof fm.thinking === "boolean" ? fm.thinking : DEFAULTS.thinking;

    // history 语义:
    //   0        → 禁用历史
    //   N>0      → 最多最近 N 条
    //   null/未声明/非法 → 全部历史(默认)
    let history: number | null;
    if (fm.history === 0) {
        history = 0;
    } else if (typeof fm.history === "number" && Number.isFinite(fm.history) && fm.history > 0) {
        history = Math.floor(fm.history);
    } else {
        history = DEFAULTS.history;
    }

    const timeout = parseTimeout(fm.timeout);

    return { maxSteps, streaming, thinking, history, timeout };
}

/** 严格解析 timeout:非法/负数/0 一律忽略并告警。 */
function parseTimeout(raw: PacFrontMatter["timeout"]): PacTimeoutConfig | undefined {
    if (raw === undefined || raw === null) return undefined;

    if (typeof raw === "number") {
        if (!Number.isFinite(raw) || raw <= 0) {
            Logger.warn(`[PAC] front matter.timeout 必须是正数,已忽略:`, raw);
            return undefined;
        }
        return Math.floor(raw);
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
        const keys = ["totalMs", "stepMs", "firstChunkMs", "chunkMs"] as const;
        const out: Record<string, number> = {};
        for (const k of keys) {
            const v = (raw as Record<string, unknown>)[k];
            if (v === undefined) continue;
            if (typeof v === "number" && Number.isFinite(v) && v > 0) {
                out[k] = Math.floor(v);
            } else {
                Logger.warn(`[PAC] front matter.timeout.${k} 必须是正数,已忽略:`, v);
            }
        }
        return Object.keys(out).length > 0 ? (out as PacTimeoutConfig) : undefined;
    }

    Logger.warn(`[PAC] front matter.timeout 类型非法,已忽略:`, raw);
    return undefined;
}

/** 提取 front matter.setDefault 为 bare-key 映射。 */
export function resolveOwnDefaults(fm: PacFrontMatter): Record<string, JsonValue> {
    const table = fm.setDefault;
    if (!table || typeof table !== "object" || Array.isArray(table)) {
        return {};
    }
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(table)) {
        out[k] = v as JsonValue;
    }
    return out;
}

/**
 * 从 PrjDB 读取 "model" 并归一化为 getSmartModel 的 options。
 *   - 字符串          → modelPattern (new RegExp)
 *   - 对象            → 透传;若 modelPattern 为字符串则转 RegExp
 *   - 缺失/异常/非法  → undefined (走默认策略)
 */
export function resolveModelOptions(ctx: IRunnerContext): ModelSelectOptions | undefined {
    let raw: unknown;
    try {
        raw = PrjDB.ensure(ctx.prj).get("model");
    } catch (e) {
        Logger.warn("[PAC] 读取 prjdb.model 失败,改用默认模型:", e);
        return undefined;
    }
    if (raw === null || raw === undefined || raw === "") return undefined;

    if (typeof raw === "string") {
        try {
            return { modelPattern: new RegExp(raw) };
        } catch (e) {
            Logger.warn(`[PAC] prjdb.model 不是合法正则,忽略: ${raw}`, e);
            return undefined;
        }
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
        const obj = raw as Record<string, unknown>;
        if (typeof obj.modelPattern === "string") {
            try {
                return { ...obj, modelPattern: new RegExp(obj.modelPattern) } as ModelSelectOptions;
            } catch (e) {
                Logger.warn(
                    `[PAC] prjdb.model.modelPattern 不是合法正则,已剔除: ${obj.modelPattern}`,
                    e,
                );
                const { modelPattern: _drop, ...rest } = obj;
                return rest as ModelSelectOptions;
            }
        }
        return obj as ModelSelectOptions;
    }

    Logger.warn("[PAC] prjdb.model 值类型异常,忽略:", raw);
    return undefined;
}