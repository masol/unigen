import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import { isPlainObject } from "radashi";
import type {
    JsonValue, ModelSelectOptions, PacFrontMatter,
    PacTimeoutConfig, ReasoningLevel, ResolvedSettings,
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
 *     ctx.settings.userSelModel / front matter.model → getSmartModel 的 options。
 *     对所有层级(含子 agent)生效。
 */

/**
 * 默认值:
 *   history: null → 根 agent 加载全部历史；子 agent 等效 0（不保留跨调用历史）。
 *            工具型子 agent 建议显式声明 history: 0 关闭。
 *   timeout: undefined → 使用 provider 默认。
 *   reasoning: "provider-default" → 使用 provider 默认推理行为。
 *   persist: true → 写入 messages 表。
 */
const DEFAULTS: ResolvedSettings = {
    maxSteps: 30,
    streaming: true,
    reasoning: "provider-default",
    persist: true,
    history: null,
    timeout: undefined,
};

/** 合法推理级别,顺序与文档一致 */
export const REASONING_LEVELS: readonly ReasoningLevel[] = [
    "provider-default",
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
] as const;

function isReasoningLevel(v: unknown): v is ReasoningLevel {
    return typeof v === "string" && (REASONING_LEVELS as readonly string[]).includes(v);
}

/**
 * 使用本次请求的临时 settings 覆盖 agent 编译期默认值。
 *
 * 仅覆盖显式提供且非 undefined 的字段，避免 JSON 中缺省字段把默认值打穿。
 */
export function resolveEffectiveSettings(
    base: ResolvedSettings,
    overrides?: Partial<ResolvedSettings>,
): ResolvedSettings {
    if (!overrides) return base;

    const out: ResolvedSettings = { ...base };
    for (const key of Object.keys(overrides) as (keyof ResolvedSettings)[]) {
        const value = overrides[key];
        if (value !== undefined) {
            (out as unknown as Record<string, unknown>)[key] = value;
        }
    }
    return out;
}

/**
 * 解析 `ProviderID::ModelID`，返回 getSmartModel 的 exact 选项。
 * 非法格式只告警并返回 undefined，由调用方继续走后续策略。
 */
function parseExactModel(
    raw: string,
    source: string,
): ModelSelectOptions | undefined {
    const value = raw.trim();
    const sep = value.indexOf("::");

    if (sep <= 0 || sep >= value.length - 2) {
        Logger.warn(`[PAC] ${source} 不是合法的 provider::model 格式,已忽略:`, raw);
        return undefined;
    }

    const providerId = value.slice(0, sep).trim();
    const modelId = value.slice(sep + 2).trim();

    if (!providerId || !modelId) {
        Logger.warn(`[PAC] ${source} 的 providerId/modelId 为空,已忽略:`, raw);
        return undefined;
    }

    return { exact: { providerId, modelId } };
}

/** FM 常量开关 → ResolvedSettings。未知/非法字段用默认值。 */
export function resolveSettings(fm: PacFrontMatter): ResolvedSettings {
    const maxSteps =
        typeof fm.maxSteps === "number" && Number.isFinite(fm.maxSteps) && fm.maxSteps > 0
            ? Math.floor(fm.maxSteps)
            : DEFAULTS.maxSteps;

    const streaming = typeof fm.streaming === "boolean" ? fm.streaming : DEFAULTS.streaming;
    const persist = typeof fm.persist === "boolean" ? fm.persist : DEFAULTS.persist;

    const reasoning: ReasoningLevel = (() => {
        if (fm.reasoning === undefined) return DEFAULTS.reasoning;
        if (isReasoningLevel(fm.reasoning)) return fm.reasoning;
        Logger.warn(`[PAC] front matter.reasoning 非法值,已忽略:`, fm.reasoning);
        return DEFAULTS.reasoning;
    })();

    // history 语义:
    //   -1       → 全部历史
    //   0        → 禁用历史
    //   N>0      → 最多最近 N 条
    //   null/未声明/非法 → 默认值（根 agent 全部；子 agent 等效 0）
    let history: number | null;
    if (fm.history === -1) {
        history = -1;
    } else if (fm.history === 0) {
        history = 0;
    } else if (typeof fm.history === "number" && Number.isFinite(fm.history) && fm.history > 0) {
        history = Math.floor(fm.history);
    } else {
        history = DEFAULTS.history;
    }

    const timeout = parseTimeout(fm.timeout);
    const temperature = parseNonNegativeNumber(fm.temperature, "temperature");
    const maxOutputTokens = parsePositiveInt(fm.maxOutputTokens, "maxOutputTokens");
    const toolCallConcurrency = parsePositiveInt(fm.toolCallConcurrency, "toolCallConcurrency");
    const strict = parseBoolean(fm.strict, "strict");

    return {
        maxSteps,
        streaming,
        reasoning,
        persist,
        history,
        timeout,
        temperature,
        maxOutputTokens,
        toolCallConcurrency,
        strict,
    };
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

function parseNonNegativeNumber(raw: unknown, field: string): number | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
        Logger.warn(`[PAC] front matter.${field} 必须是非负数,已忽略:`, raw);
        return undefined;
    }
    return raw;
}

function parsePositiveInt(raw: unknown, field: string): number | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
        Logger.warn(`[PAC] front matter.${field} 必须是正整数,已忽略:`, raw);
        return undefined;
    }
    return raw;
}

function parseBoolean(raw: unknown, field: string): boolean | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw === "boolean") return raw;
    Logger.warn(`[PAC] front matter.${field} 必须是布尔值,已忽略:`, raw);
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
 * 解析模型选择选项。
 *
 * 优先级：
 *   1. ctx.settings.userSelModel 为 string → 直接按 `ProviderID::ModelID` exact 选择；
 *   2. ctx.settings.userSelModel 为 object 且当前 agent 有 requireModel → 以 requireModel
 *      为 key 取 `ProviderID::ModelID`，exact 选择；
 *   3. 以上未取到值时，使用当前 agent front matter.model 解析：
 *      - string：按 `modelPattern` 正则处理；
 *      - object：作为模型选择选项透传；其中 modelPattern 字段若为字符串则转正则。
 *
 * @param requireModel 当前 agent front matter.requireModel
 * @param fmModel 当前 agent front matter.model
 */
export function resolveModelOptions(
    ctx: IRunnerContext,
    requireModel?: string,
    fmModel?: PacFrontMatter["model"],
): ModelSelectOptions | undefined {
    const override = ctx.settings?.userSelModel;

    if (typeof override === "string") {
        const exact = parseExactModel(override, "ctx.settings.userSelModel");
        if (exact) return exact;
    } else if (isPlainObject(override)) {
        const key = requireModel?.trim();
        if (key) {
            // 自身请求模型,优先级高于默认。
            const raw = override[key] || override["default"];
            if (typeof raw === "string") {
                const exact = parseExactModel(raw, `ctx.settings.userSelModel["${key}"]`);
                if (exact) return exact;
            } else if (raw !== undefined) {
                Logger.warn(
                    `[PAC] ctx.settings.userSelModel["${key}"] 必须是 provider::model 字符串,已忽略:`,
                    raw,
                );
            }
        }
    } else if (override !== undefined) {
        Logger.warn(`[PAC] ctx.settings.userSelModel 类型非法,已忽略:`, override);
    }

    const raw = fmModel;
    if (raw === null || raw === undefined || raw === "") return undefined;

    if (typeof raw === "string") {
        try {
            return { modelPattern: new RegExp(raw) };
        } catch (e) {
            Logger.warn(`[PAC] front matter.model 不是合法正则,忽略: ${raw}`, e);
            return undefined;
        }
    }

    if (isPlainObject(raw)) {
        const obj = raw as Record<string, unknown>;

        if (typeof obj.modelPattern === "string") {
            try {
                return { ...obj, modelPattern: new RegExp(obj.modelPattern) } as ModelSelectOptions;
            } catch (e) {
                Logger.warn(
                    `[PAC] front matter.model.modelPattern 不是合法正则,已剔除: ${obj.modelPattern}`,
                    e,
                );
                const { modelPattern: _drop, ...rest } = obj;
                return rest as ModelSelectOptions;
            }
        }
        return obj as ModelSelectOptions;
    }

    Logger.warn("[PAC] front matter.model 值类型异常,忽略:", raw);
    return undefined;
}