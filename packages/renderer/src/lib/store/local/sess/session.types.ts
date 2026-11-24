// packages/renderer/src/lib/store/local/sess/session.types.ts
//
// 会话级「自动任务」配置的客户端类型与工具。
// 存储位置：ChatSession.extra.autoTask（JSON 列，服务端仅透传不参与业务）。

export type AutoCompletionStrategy = "passive" | "active";

/**
 * 自动续写（completion）配置。
 *
 * 两种策略：
 *   - active（主动探测）：检测到「思考内容与正文内容完全相同」这一僵局时，
 *     自动发送 activePrompt 续写模型继续输出。
 *   - passive（被动探测）：向模型发送 passiveProbePrompt，
 *     若模型回复中出现 passiveCompletionMarker，则视为输出完整。
 *     额外的 passiveAppendPrompt 会被追加到用户输入的末尾
 *     （例如要求模型在结尾输出完成标记），使首轮回复即可携带标记，
 *     从而省去一次额外的探测请求；留空时每轮都需要单独发起确认。
 *
 * 两种策略共享 maxRounds 上限，达到后停止，避免死循环。
 */
export interface AutoCompletionConfig {
    /** 是否启用自动续写 */
    enabled: boolean;
    /** 探测策略 */
    strategy: AutoCompletionStrategy;
    /** 最多自动补全的轮次 */
    maxRounds: number;
    /** 主动探测：思考与正文一致时发送的续写提示 */
    activePrompt: string;
    /** 被动探测：发送给模型、要求其在完整时输出完成标记的探测提示 */
    passiveProbePrompt: string;
    /**
     * 被动探测：自动追加到用户输入末尾的提示词。
     *
     * 典型用法是要求模型在回复结尾输出完成标记，让首轮回复就携带标记，
     * 省去一次独立的确认请求。允许留空；留空时每一轮都需要额外发起一次探测。
     */
    passiveAppendPrompt: string;
    /** 被动探测：正文中表示「已完整」的标记 */
    passiveCompletionMarker: string;
}

/**
 * 主动探测默认提示语。
 *
 * 设计要点：
 *   - 明确说「继续输出剩余内容」而非「重新输出」，避免重复；
 *   - 强调「直到自然结束」以打破思考-正文一致的僵局；
 *   - 不引入额外格式要求，减少对模型输出的干扰。
 */
export const DEFAULT_ACTIVE_PROMPT =
    "请继续输出剩余内容，直到自然结束为止；不要重复已输出的部分。";

/**
 * 被动探测默认提示语。
 *
 * 设计要点：
 *   - 先要求模型「检查上一条回复是否被截断」，触发自我审视；
 *   - 明确两种分支：完整 → 只输出标记；未完整 → 直接继续输出；
 *   - 标记使用英文方括号常量，显著降低与正常正文混淆的概率
 *     （中文短句「我已输出完整」在自然内容中很容易出现，导致误判）。
 */
export const DEFAULT_PASSIVE_PROBE_PROMPT =
    "请检查上一条回复是否被网络中断或长度限制截断。" +
    "若内容已完整，请只在最后单独输出一行：[END_OF_RESPONSE]；" +
    "若未完整，请直接继续输出剩余部分，不要重复已输出的内容，也不要添加任何说明。";

/** 被动探测默认完成标记（与默认提示语中的标记保持一致）。 */
export const DEFAULT_PASSIVE_COMPLETION_MARKER = "[END_OF_RESPONSE]";

/**
 * 被动探测默认追加提示词：默认留空。
 *
 * 追加会改变用户的原始输入，属于「默认可观察到的行为变更」，
 * 因此不在默认配置里主动介入；留空时由 UI 提示每轮额外请求的开销。
 */
export const DEFAULT_PASSIVE_APPEND_PROMPT = "";

/** completion 配置的默认值（关闭状态）。 */
export const DEFAULT_COMPLETION_CONFIG: Readonly<AutoCompletionConfig> =
    Object.freeze({
        enabled: false,
        strategy: "passive",
        maxRounds: 10,
        activePrompt: DEFAULT_ACTIVE_PROMPT,
        passiveProbePrompt: DEFAULT_PASSIVE_PROBE_PROMPT,
        passiveAppendPrompt: DEFAULT_PASSIVE_APPEND_PROMPT,
        passiveCompletionMarker: DEFAULT_PASSIVE_COMPLETION_MARKER,
    });

/** 定时任务（预留，UI 灰化） */
export interface AutoScheduleConfig {
    enabled: boolean;
}

/** 条件任务（预留，UI 灰化） */
export interface AutoConditionConfig {
    enabled: boolean;
}

export interface AutoTaskConfig {
    completion?: AutoCompletionConfig;
    schedule?: AutoScheduleConfig;
    condition?: AutoConditionConfig;
}

/**
 * 对 completion 字段做默认值归一化。
 *
 * 用途：兼容旧版本落盘数据（缺少 maxRounds / 提示语 / 追加提示词等字段）。
 * 采用 `raw?.field ?? DEFAULT.field` 逐字段兜底，避免展开运算符把
 * 显式 undefined 字段覆盖默认值；空字符串是有意义的值，`??` 会保留它。
 */
export function normalizeCompletionConfig(
    raw: Partial<AutoCompletionConfig> | null | undefined,
): AutoCompletionConfig {
    return {
        enabled: raw?.enabled ?? DEFAULT_COMPLETION_CONFIG.enabled,
        strategy: raw?.strategy ?? DEFAULT_COMPLETION_CONFIG.strategy,
        maxRounds: raw?.maxRounds ?? DEFAULT_COMPLETION_CONFIG.maxRounds,
        activePrompt: raw?.activePrompt ?? DEFAULT_COMPLETION_CONFIG.activePrompt,
        passiveProbePrompt:
            raw?.passiveProbePrompt ??
            DEFAULT_COMPLETION_CONFIG.passiveProbePrompt,
        passiveAppendPrompt:
            raw?.passiveAppendPrompt ??
            DEFAULT_COMPLETION_CONFIG.passiveAppendPrompt,
        passiveCompletionMarker:
            raw?.passiveCompletionMarker ??
            DEFAULT_COMPLETION_CONFIG.passiveCompletionMarker,
    };
}

/**
 * 从 session.extra 读取自动任务配置。
 * 返回**深拷贝**，调用方可安全修改（避免污染 store 原始对象）。
 */
export function readAutoTaskConfig(
    extra: Record<string, unknown> | null | undefined,
): AutoTaskConfig {
    if (!extra || typeof extra !== "object") return {};
    const raw = (extra as { autoTask?: unknown }).autoTask;
    if (!raw || typeof raw !== "object") return {};
    const config = raw as AutoTaskConfig;

    return {
        completion: config.completion
            ? normalizeCompletionConfig(config.completion)
            : undefined,
        schedule: config.schedule ? { ...config.schedule } : undefined,
        condition: config.condition ? { ...config.condition } : undefined,
    };
}

/**
 * 轻量判断：是否配置了任意一项自动任务。
 * 不做深拷贝（仅用于角标渲染）。
 */
export function hasAnyAutoTask(
    extra: Record<string, unknown> | null | undefined,
): boolean {
    if (!extra || typeof extra !== "object") return false;
    const raw = (extra as { autoTask?: unknown }).autoTask;
    if (!raw || typeof raw !== "object") return false;
    const config = raw as AutoTaskConfig;
    return Boolean(
        config.completion?.enabled ||
        config.schedule?.enabled ||
        config.condition?.enabled,
    );
}