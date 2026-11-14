// packages/main/src/types/blueprint/settings.ts

import { z } from 'zod';

/**
 * 推理级别。语义对齐 Vercel AI SDK：
 *   - provider-default: 使用 provider 默认行为(省略时的默认值)
 *   - none:            禁用推理(最低推理级别,如果不能禁用)
 *   - minimal:         最小推理
 *   - low:             快速、简洁推理
 *   - medium:          平衡推理
 *   - high:            深度推理
 *   - xhigh:           极高级推理
 *   - max:             最大推理
 */
export const ReasoningLevelSchema = z.enum([
    'provider-default',
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
]);

export type ReasoningLevel = z.infer<typeof ReasoningLevelSchema>;

/**
 * PAC 超时配置，对齐 AI SDK：
 *   - number: 总超时(毫秒)
 *   - object: 细粒度控制
 *     - totalMs:      整个调用总时长
 *     - stepMs:       单个 agent 步骤
 *     - firstChunkMs: 首个有意义 chunk 的等待时长(仅 stream 生效)
 *     - chunkMs:      相邻 chunk 之间的最大间隔(仅 stream 生效)
 */
export const PacTimeoutConfigSchema = z.union([
    z.number().positive(),
    z.object({
        totalMs: z.number().positive().optional(),
        stepMs: z.number().positive().optional(),
        firstChunkMs: z.number().positive().optional(),
        chunkMs: z.number().positive().optional(),
    }),
]);

export type PacTimeoutConfig = z.infer<typeof PacTimeoutConfigSchema>;

/**
 * 集中处理后的运行配置，所有开关都有默认值。
 *
 * 单一真源：`$libs/blueprint/capability/local/settings.ts` 的 `resolveSettings`
 * 负责产出该结构；`RunnerParamSchema.settings` 以 `.partial()` 形式接收用户
 * 本次请求的临时覆盖。
 */
export const ResolvedSettingsSchema = z.object({
    /** 单个 agent 步数上限，默认 30 */
    maxSteps: z.number().positive(),
    /** 根 agent 是否流式输出(仅根生效)，默认 true */
    streaming: z.boolean(),
    /** 推理级别，默认 "provider-default" */
    reasoning: ReasoningLevelSchema,
    /** 是否在 messages 表持久化消息，默认 true */
    persist: z.boolean(),
    /**
     * 历史消息策略：
     *   null : 全部历史(默认)
     *  -1    : 全部历史
     *   0    : 禁用历史
     *   N>0  : 最多取最近 N 条
     */
    history: z.number().int().nullable(),
    /**
     * 客户端临时模型选择覆盖。
     *
     * - string: 形如 `ProviderID::ModelID`，直接 exact 选择模型；
     * - object: key 为 agent front matter 的 `requireModel`，value 为
     *   `ProviderID::ModelID`，按当前 agent 的 requireModel 取 exact 模型。
     */
    userSelModel: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
    /** 本次调用的超时配置；undefined 表示使用 provider 默认 */
    timeout: PacTimeoutConfigSchema.optional(),
    /** 采样温度；undefined 表示使用 provider 默认 */
    temperature: z.number().nonnegative().optional(),
    /** 输出 token 上限；undefined 表示使用 provider 默认 */
    maxOutputTokens: z.number().int().positive().optional(),
    /** 工具调用并发上限；undefined 表示由 SDK 决定 */
    toolCallConcurrency: z.number().int().positive().optional(),
    /** 是否启用 strict tool calling；undefined 表示不显式指定 */
    strict: z.boolean().optional(),
});

export type ResolvedSettings = z.infer<typeof ResolvedSettingsSchema>;