// packages/renderer/src/lib/store/local/msg/auto.ts
//
// 自动续写的纯逻辑：
//   - buildAutoRuntime：从会话配置构建一次请求链的共享运行时；
//   - shouldAppendFirstUserContent / appendPassivePrompt：主动策略发送前追加提示词；
//   - getRootAgentThought：只读取根 agent 节点的思考信息；
//   - decideAutoContinue：每轮 run 结束后决定是否自动发送下一轮。
//
// 注意：持久化字段 strategy 的命名与 UI 语义相反：
//   - strategy === "active"  → UI「被动」：检查思考与正文是否完全一致；
//   - strategy === "passive" → UI「主动」：检查正文是否包含完成标记。
import { isTraceAgentNode } from "../chat.guards";
import type { AutoCompletionConfig } from "../sess/session.types";
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
 * 自动探测轮次不会追加，避免重复污染探测请求。
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
 * 调用方据此视为「没有思考信息 → 思考与正文不相等」。
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
 * 返回 null 表示停止；返回字符串表示下一轮要发送的用户内容。
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

    if (runtime.config.strategy === "active") {
        const thought = getRootAgentThought(assistant);
        if (!thought) return null;
        if (thought !== content.trim()) return null;

        const prompt = runtime.config.activePrompt.trim();
        return prompt || null;
    }

    const marker = runtime.config.passiveCompletionMarker.trim();
    if (!marker) return null;
    if (content.includes(marker)) return null;

    const prompt = runtime.config.passiveProbePrompt.trim();
    return prompt || null;
}