// packages/renderer/src/lib/store/local/msg/auto.ts
//
// 自动续写的纯逻辑：
//   - buildAutoRuntime：从会话配置构建一次请求链的共享运行时；
//   - shouldAppendFirstUserContent / appendPassivePrompt：主动策略发送前追加提示词；
//   - getRootAgentThought：只读取根 agent 节点的思考信息；
//   - decideAutoContinue：每轮 run 结束后决定是否自动发送下一轮。
//
// 注意：持久化字段 strategy 的命名与 UI 语义相反（详见 sess/session.types.ts）：
//   - strategy === "active"  → UI「被动」：被动监测本轮是否停滞 ——
//       · 思考与正文完全一致 → 发送 activePrompt；
//       · 有思考而无正文     → 渲染 activeEmptyBodyPrompt（补回上一轮思考）。
//     两种情况都以独立的新一轮消息发出，不修改用户原始输入。
//   - strategy === "passive" → UI「主动」：主动探测正文是否包含完成标记。
import { isTraceAgentNode } from "../chat.guards";
import {
    hasThinkingPlaceholder,
    renderThinkingTemplate,
    type AutoCompletionConfig,
} from "../sess/session.types";
import type { AutoCompletionRuntime, ChatMessage } from "./types";

/**
 * 构建自动续写运行时。
 *
 * enabled 为 false 或 completion 缺失时返回 null，调用方走原有逻辑即可。
 * maxRounds 做一次防御性归一化，兼容旧数据中可能出现的非法值。
 */
export function buildAutoRuntime(
    completion: AutoCompletionConfig | undefined,
    mode: string | null,
    tools: string[],
    skills: string[],
    messages: ChatMessage[],
): AutoCompletionRuntime | null {
    if (!completion?.enabled) return null;

    const rawMax = completion.maxRounds;
    const maxRounds = Number.isFinite(rawMax)
        ? Math.max(0, Math.floor(rawMax))
        : 0;

    return {
        config: completion,
        maxRounds,
        rounds: 0,
        mode,
        tools: [...tools],
        skills: [...skills],
        messages,
    };
}

/**
 * 首轮用户内容是否需要追加 passiveAppendPrompt。
 *
 * 仅主动策略（持久化字段 passive）且追加内容非空时生效。
 * 这是**唯一**会改动用户原始输入的续写行为；
 * 被动策略（持久化字段 active）的全部续写都作为独立的新一轮消息发出。
 * 自动轮次不会追加，避免重复污染探测请求。
 */
export function shouldAppendFirstUserContent(
    runtime: AutoCompletionRuntime | null,
): boolean {
    if (!runtime?.config.enabled) return false;
    if (runtime.config.strategy !== "passive") return false;
    return runtime.config.passiveAppendPrompt.trim().length > 0;
}

/**
 * 将 passiveAppendPrompt 追加到用户内容后方。
 *
 * 只影响发送给模型的内容，不修改本地 ChatMessage.content；
 * 用户消息的展示保持原始输入。
 */
export function appendPassivePrompt(
    content: string,
    runtime: AutoCompletionRuntime,
): string {
    if (!shouldAppendFirstUserContent(runtime)) return content;

    const append = runtime.config.passiveAppendPrompt.trim();
    if (!append) return content;

    return content.length > 0 ? `${content}\n${append}` : append;
}

/**
 * 读取根 agent 的思考信息。
 *
 * 只检查 traces 根级中第一个 agent 节点，不递归子节点。
 * 没有根 agent、detail 不是字符串或为空时返回 null；
 * 调用方据此视为「没有思考信息」。
 */
export function getRootAgentThought(message: ChatMessage): string | null {
    if (!Array.isArray(message.traces)) return null;

    const rootAgent = message.traces.find(
        (node) => node && isTraceAgentNode(node),
    );
    if (!rootAgent) return null;

    const detail = rootAgent.detail;
    if (typeof detail !== "string") return null;

    const thought = detail.trim();
    return thought.length > 0 ? thought : null;
}

/**
 * 根据本轮助手消息判断是否需要自动发送下一轮。
 *
 * 返回 null 表示停止；返回字符串表示下一轮要发送的用户内容
 * （由调用方作为**新的一条用户消息**发出，不改动原输入）。
 * rounds 在本函数内只读，实际递增由调用方在真正发送前完成。
 */
export function decideAutoContinue(
    runtime: AutoCompletionRuntime,
    assistant: ChatMessage,
): string | null {
    if (!runtime.config.enabled) return null;
    if (assistant.isError) return null;
    if (runtime.rounds >= runtime.maxRounds) return null;

    const content =
        typeof assistant.content === "string" ? assistant.content : "";

    // 被动策略（持久化 "active"）
    if (runtime.config.strategy === "active") {
        const thought = getRootAgentThought(assistant);
        if (!thought) return null;

        // 「有思考、无正文」：整轮输出预算耗在思考阶段（被长度限制截断，
        // 或上游在思考结束后直接结束了本轮）。此时思考与正文不可能相等，
        // 若沿用下面的「相等」判定会直接停机，因此必须先单独处理。
        //
        // 协议在下一轮不会回传上一轮的 reasoning，所以要把思考渲染进
        // 新一轮的用户消息，否则模型会从零重新思考（重复消耗 + 结论漂移）。
        if (content.trim().length === 0) {
            const template = runtime.config.activeEmptyBodyPrompt.trim();
            if (!template || !hasThinkingPlaceholder(template)) return null;
            return renderThinkingTemplate(template, thought);
        }

        // 思考与正文完全一致 → 视为输出停滞，发送续写提示语
        if (thought !== content.trim()) return null;

        const prompt = runtime.config.activePrompt.trim();
        return prompt || null;
    }

    // 主动策略（持久化 "passive"）：完成标记探测
    const marker = runtime.config.passiveCompletionMarker.trim();
    if (!marker) return null;
    if (content.includes(marker)) return null;

    const prompt = runtime.config.passiveProbePrompt.trim();
    return prompt || null;
}