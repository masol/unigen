// packages/renderer/src/lib/store/local/sess/session.types.ts
//
// 会话级「自动任务」配置的客户端类型与工具。
// 存储位置：ChatSession.extra.autoTask（JSON 列，服务端仅透传不参与业务）。

export type AutoCompletionStrategy = "passive" | "active";

/**
 * 自动续写（completion）配置。
 *
 * ⚠️ 持久化字段名与界面语义相反（历史遗留，**不要用中文名反推字段名**）：
 *
 *   - strategy === "active"（界面「被动」）
 *       被动监测本轮是否停滞。命中后**以独立的新一轮消息**发送续写提示，
 *       不修改用户原始输入、也不向其末尾追加任何内容：
 *         · 思考与正文完全一致        → 发送 activePrompt；
 *         · 有思考、无正文（截断在思考阶段）→ 渲染 activeEmptyBodyPrompt，
 *           把上一轮未回传的思考补回，避免模型从零重复思考
 *           （协议不会在下一轮回传上一轮的 reasoning）。
 *
 *   - strategy === "passive"（界面「主动」）
 *       主动向模型发起探测：
 *         · 发送 passiveProbePrompt，检测正文中是否出现 passiveCompletionMarker；
 *         · 可把 passiveAppendPrompt 追加到**首轮**用户输入末尾，
 *           使首轮回复即携带完成标记，省去一次独立探测请求。
 *
 * 两种策略共享 maxRounds 上限，达到后停止，避免死循环。
 */
export interface AutoCompletionConfig {
    /** 是否启用自动续写 */
    enabled: boolean;
    /** 探测策略（与界面文案相反，见上方说明） */
    strategy: AutoCompletionStrategy;
    /** 最多自动补全的轮次 */
    maxRounds: number;
    /**
     * strategy "active"（界面「被动」）：思考与正文完全一致时发送的续写提示。
     * 作为独立的新一轮消息发出，不修改用户原始输入。
     */
    activePrompt: string;
    /**
     * strategy "active"（界面「被动」）：「有思考、无正文」场景使用的续写模板。
     *
     * 场景：模型把输出预算全部花在思考上（被长度限制截断在思考阶段，
     * 或上游在思考结束后就结束了本轮），本轮助手消息只有 trace 思考、
     * 正文为空。被动监测到这种停滞时，若只发 activePrompt，模型看不到
     * 自己上一轮的思考 —— 协议在下一轮**不会回传上一轮的 reasoning** ——
     * 它会从零重新思考，既浪费 token，也可能得出与上一轮冲突的结论。
     *
     * 因此该模板负责把上一轮思考「补回」到**新一轮**用户消息里，让模型接着往下写。
     * 模板中的 `{{_Thinking}}`（或 `{{{_Thinking}}}`）会被替换为上一轮思考全文，
     * **不做任何转义**。
     *
     * 留空（或模板中不含占位符）表示不启用该分支，退化为原有行为（静默停止）。
     */
    activeEmptyBodyPrompt: string;
    /** strategy "passive"（界面「主动」）：要求模型在完整时输出完成标记的探测提示 */
    passiveProbePrompt: string;
    /**
     * strategy "passive"（界面「主动」）：自动追加到用户输入末尾的提示词。
     *
     * 典型用法是要求模型在回复结尾输出完成标记，让首轮回复就携带标记，
     * 省去一次独立的确认请求。允许留空；留空时每一轮都需要额外发起一次探测。
     *
     * 注意：这是**唯一**会改动用户原始输入的功能，且只在 strategy "passive"
     * （界面「主动」）下生效。
     */
    passiveAppendPrompt: string;
    /** strategy "passive"（界面「主动」）：正文中表示「已完整」的标记 */
    passiveCompletionMarker: string;
}

/**
 * 被动策略默认提示语（思考与正文完全一致时发送）。
 *
 * 设计要点：
 *   - 明确说「继续输出剩余内容」而非「重新输出」，避免重复；
 *   - 强调「直到自然结束」以打破思考-正文一致的僵局；
 *   - 不引入额外格式要求，减少对模型输出的干扰。
 */
export const DEFAULT_ACTIVE_PROMPT =
    "请继续输出剩余内容，直到自然结束为止；不要重复已输出的部分。";

/**
 * 被动策略默认「有思考、无正文」模板。
 *
 * 写法要点（改这个模板时请保持）：
 *   1. 先声明「这段是没有随对话历史回传的、你自己的思考」，
 *      消除模型把它当成用户提供的外部资料的误解；
 *   2. 用分隔线把思考原文独立成块，减少模型把它当作待点评内容的概率；
 *   3. 明确「不是让你重写」+「从断点继续」+「补出缺失正文」+「不要先回应本段」，
 *      这四件事缺一，模型就容易回一句「好的，我继续」而浪费一轮。
 *
 * 全文不含 HTML：渲染结果会被直接当作**用户消息**发送给模型。
 */
export const DEFAULT_ACTIVE_EMPTY_BODY_PROMPT = [
    "以下是你上一轮回复中断时已经产生的思考内容。这段思考没有随对话历史回传给你，现在补回，供你接续。",
    "",
    "--- 上一轮思考开始 ---",
    "{{_Thinking}}",
    "--- 上一轮思考结束 ---",
    "",
    "上一轮只产生了思考、没有产生正文。请以上面的思考为起点继续，不要复述或重写它，直接从它中断处往下推进，把缺失的正文完整输出；也不要先回应这段说明。",
].join("\n");

/**
 * 主动策略默认提示语。
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

/** 主动策略默认完成标记（与默认提示语中的标记保持一致）。 */
export const DEFAULT_PASSIVE_COMPLETION_MARKER = "[END_OF_RESPONSE]";

/**
 * 主动策略默认追加提示词：默认留空。
 *
 * 追加会改变用户的原始输入，属于「默认可观察到的行为变更」，
 * 因此不在默认配置里主动介入；留空时由 UI 提示每轮额外请求的开销。
 */
export const DEFAULT_PASSIVE_APPEND_PROMPT = "";

/**
 * 模板中代表「上一轮思考全文」的占位符。
 *
 * 只此一个变量：完成标记是**判定**用的、轮次是**控制**用的，
 * 二者都不应该进入提示词模板，否则判定/控制逻辑会和提示词耦合。
 */
export const THINKING_PLACEHOLDER = "{{_Thinking}}";

/**
 * 占位符匹配式（供 `hasThinkingPlaceholder` 使用，刻意不带 `g` 标志）。
 *
 * 同时接受 `{{_Thinking}}` 与 Handlebars 的「不转义」写法 `{{{_Thinking}}}`：
 * 本模板走纯文本管道，任何转义都会污染思考原文，因此两种写法都按原文替换。
 */
const THINKING_PLACEHOLDER_TEST_RE = /\{\{\{?\s*_Thinking\s*\}?\}\}/;

/** 占位符全局匹配式（供 `renderThinkingTemplate` 使用）。 */
const THINKING_PLACEHOLDER_ALL_RE = /\{\{\{?\s*_Thinking\s*\}?\}\}/g;

/**
 * 模板是否包含思考占位符。
 *
 * 复用一个**非全局**正则：带 `g` 的正则调用 `test()` 会推进 `lastIndex`，
 * 下一次调用可能从中间开始匹配并返回 false，属于典型的隐蔽状态 bug。
 */
export function hasThinkingPlaceholder(template: string): boolean {
    return THINKING_PLACEHOLDER_TEST_RE.test(template);
}

/**
 * 把思考原文渲染进模板。
 *
 * 契约：
 *   - **不做任何转义**（不是 HTML/实体管道，结果直接作为纯文本发送）；
 *   - 支持多次出现占位符，全部替换；
 *   - 使用函数替换：字符串替换会把思考里的 `$&` / `$1` / `$'`
 *     误当成替换模式解析，静默吞掉原文；
 *   - 模板不含占位符时原样返回 —— 调用方应先用 `hasThinkingPlaceholder`
 *     判断，避免把未渲染的模板当作有效提示词发出去。
 */
export function renderThinkingTemplate(
    template: string,
    thinking: string,
): string {
    return template.replace(THINKING_PLACEHOLDER_ALL_RE, () => thinking);
}

/** completion 配置的默认值（关闭状态）。 */
export const DEFAULT_COMPLETION_CONFIG: Readonly<AutoCompletionConfig> =
    Object.freeze({
        enabled: false,
        strategy: "passive",
        maxRounds: 10,
        activePrompt: DEFAULT_ACTIVE_PROMPT,
        activeEmptyBodyPrompt: DEFAULT_ACTIVE_EMPTY_BODY_PROMPT,
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
 * 用途：兼容旧版本落盘数据（缺少 maxRounds / 提示语 / 追加提示词 /
 * 有思考无正文模板等字段）。
 * 采用 `raw?.field ?? DEFAULT.field` 逐字段兜底，避免展开运算符把
 * 显式 undefined 字段覆盖默认值；空字符串是有意义的值，`??` 会保留它
 * （例如用户主动清空 activeEmptyBodyPrompt 表示关闭该分支）。
 */
export function normalizeCompletionConfig(
    raw: Partial<AutoCompletionConfig> | null | undefined,
): AutoCompletionConfig {
    return {
        enabled: raw?.enabled ?? DEFAULT_COMPLETION_CONFIG.enabled,
        strategy: raw?.strategy ?? DEFAULT_COMPLETION_CONFIG.strategy,
        maxRounds: raw?.maxRounds ?? DEFAULT_COMPLETION_CONFIG.maxRounds,
        activePrompt: raw?.activePrompt ?? DEFAULT_COMPLETION_CONFIG.activePrompt,
        activeEmptyBodyPrompt:
            raw?.activeEmptyBodyPrompt ??
            DEFAULT_COMPLETION_CONFIG.activeEmptyBodyPrompt,
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