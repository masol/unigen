// packages/main/src/libs/blueprint/capability/local/agent/history.ts
//
// 根 agent 会话历史的唯一入口。
//
// 真源: PrjDB.messages 表 (以 sessionId 聚合)。
// 不再引入独立的 HistoryStore 抽象 —— 它导致两份真源且在当前宿主中从未被注入,
// 实际结果是历史永远为空。
//
// 过滤规则:
//   - mode === "cmd" 的消息不参与历史
//   - excludeMessageIds 命中的消息跳过 (通常用于排除本轮的 user / assistant 占位)
//   - 内容为空的 assistant 消息跳过 (流式生成尚未落内容的占位行)
//   - isError 的 assistant 用 SYSTEM_FAILURE_MARKER 替换,保证成对且不污染正文
//
// 作用域:
//   - 仅 root agent 读 PrjDB 会话历史;子 agent 使用 PacRunState 中的内存级历史。
//   - 子 agent 的 history 语义:
//       null → 0（默认不保留跨调用历史）
//       -1   → 全部历史
//       0    → 禁用
//       N>0  → 最近 N 条
//   - 子 agent 内存历史只存在于当前根 run 的 PacRunState 生命周期内。
//
// 并发模型（重要）:
//   子 agent 同一 agentId 可能被父 agent 并行调用。为避免读写竞争，
//   历史操作为「读快照 → 执行 → 原子追加一对 user/assistant」：
//     - 调用开始: loadSubAgentPriorMessages 返回快照（浅拷贝，不持有锁）;
//     - 执行完毕/失败/中断: appendSubAgentHistory 同步追加一对,
//       该函数体内无 await,JS 单线程保证 push 与 set 的相对原子;
//     - 因此并发调用各自追加自己的一对，不会互相覆盖，也不会丢失。
//   失败/中断时 assistant 一律写 SYSTEM_FAILURE_MARKER，
//   保证 messages 始终 user/assistant 成对，避免孤立 user 触发 provider 报错。

import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { ChatMessage } from "$types/shared/chat.js";
import type { ModelMessage } from "ai";
import Logger from "electron-log/main.js";
import type { CompiledPacAgent } from "../type.js";
import type { PacRunState } from "./types.js";

/**
 * 系统标注: 上一轮 assistant 回合缺失或失败的占位。
 *
 * 用 XML 风格标签让 LLM 把它识别为元数据而非普通对话;
 * Claude / GPT-4o / Gemini 等主流 instruct 模型都能稳定理解并忽略它。
 */
export const SYSTEM_FAILURE_MARKER =
    "<system-note>Previous assistant turn failed to produce output; " +
    "disregard it and answer the current user message directly.</system-note>";

/**
 * 子 agent 的历史上限语义：
 *   null（未声明）→ 0，子 agent 默认不保留跨调用历史
 *   -1          → null，表示全部历史
 *   0 / N>0     → 原样
 *
 * 返回值中 null 表示"全部"，0 表示"禁用"，N>0 表示最近 N 条。
 */
export function resolveSubAgentHistoryLimit(
    historyLimit: number | null,
): number | null {
    if (historyLimit === -1) return null;
    if (historyLimit === null) return 0;
    return historyLimit;
}

/**
 * 读取子 agent 的内存历史快照（浅拷贝）。
 *
 * 每次调用都从 Map 中取一个新数组副本作为本地缓冲，后续执行过程中
 * 不读也不写 Map，直到 appendSubAgentHistory 统一提交，避免读写竞争。
 *
 * @param effectiveLimit resolveSubAgentHistoryLimit 的结果：
 *        null → 全部；0 → 空；N>0 → 最近 N 条
 */
export function loadSubAgentPriorMessages(
    state: PacRunState,
    agentId: string,
    effectiveLimit: number | null,
): ModelMessage[] {
    if (effectiveLimit === 0) return [];

    const all = state.subAgentHistories.get(agentId) ?? [];
    if (effectiveLimit === null) return all.slice();
    return all.slice(-effectiveLimit);
}

/**
 * 子 agent 调用结束后，原子追加一对 user/assistant 到内存历史。
 *
 * 该函数体内无 await，push 与 set 的相对顺序由 JS 单线程保证；
 * 并发调用同一 agentId 时，各自追加自己的一对，不会互相覆盖。
 *
 * @param effectiveLimit resolveSubAgentHistoryLimit 的结果：
 *        0 → 不追加（history: 0 语义为"每次单次输入"）
 *        其他 → 追加；若配置了 N>0，则同步截断到最近 N 条
 * @param userMessage 本轮 user 消息（与读取快照时的快照无关，是本轮新构造的）
 * @param assistantText assistant 回复；失败/中断时传 SYSTEM_FAILURE_MARKER
 */
export function appendSubAgentHistory(
    state: PacRunState,
    agentId: string,
    effectiveLimit: number | null,
    userMessage: ModelMessage,
    assistantText: string,
): void {
    if (effectiveLimit === 0) return;

    const history = state.subAgentHistories.get(agentId) ?? [];
    history.push(userMessage);
    history.push({ role: "assistant", content: assistantText });

    state.subAgentHistories.set(
        agentId,
        effectiveLimit === null || history.length <= effectiveLimit
            ? history
            : history.slice(-effectiveLimit),
    );
}

function toModelMessage(m: ChatMessage): ModelMessage {
    return {
        role: m.role,
        content: m.content,
    };
}

/**
 * 从 PrjDB 读取并过滤本会话的历史消息。
 */
function readSessionMessages(
    ctx: IRunnerContext,
    excludeIds: ReadonlySet<string>,
): ModelMessage[] {
    const prjdb = PrjDB.ensure(ctx.prj);
    const raw = prjdb.listMessages({
        sessionId: ctx.sessId,
        orderDir: "asc",
    });

    const kept: ModelMessage[] = [];
    for (const m of raw) {
        if (m.mode === "cmd") continue;
        if (excludeIds.has(m.id)) continue;
        if (m.role === "assistant" && !m.content) continue;
        if (m.role === "assistant" && m.isError) {
            // 失败回合统一用占位符,断掉的半句话不进 LLM 上下文
            kept.push({ role: "assistant", content: SYSTEM_FAILURE_MARKER });
            continue;
        }
        kept.push(toModelMessage(m));
    }
    return kept;
}

/**
 * 加载当前根会话历史,供 agent 执行使用。
 *
 * 子 agent 不使用此函数，请使用 loadSubAgentPriorMessages。
 *
 * @param historyLimit  null/-1 → 全部;0 → 空;N > 0 → 最近 N 条
 * @param histEnabled   false 时无条件返回空
 * @param isRoot        仅 root agent 读历史,子 agent 固定返回空
 * @param excludeMessageIds 需要排除的消息 id (通常是本轮的 user 与 assistant 占位)
 *
 * **防御性修复**: 若过滤后末尾是孤立 user,追加占位 assistant 保证消息成对,
 * 规避某些 provider 对未配对 user 消息报错。
 */
export async function loadPriorMessages(
    ctx: IRunnerContext,
    agentId: string,
    historyLimit: number | null,
    histEnabled: boolean,
    isRoot: boolean,
    excludeMessageIds: readonly string[] = [],
): Promise<ModelMessage[]> {
    if (!histEnabled) return [];
    if (historyLimit === 0) return [];
    if (!isRoot) return [];

    let messages: ModelMessage[];
    try {
        const excl = new Set(excludeMessageIds.filter(Boolean));
        messages = readSessionMessages(ctx, excl);
    } catch (e) {
        Logger.warn(`[PAC] 读取历史失败 (agent=${agentId}):`, e);
        return [];
    }

    if (
        messages.length > 0 &&
        messages[messages.length - 1].role === "user"
    ) {
        Logger.warn(
            `[PAC] 历史末尾是孤立 user 消息,追加占位 assistant 补齐 (agent=${agentId})`,
        );
        messages.push({ role: "assistant", content: SYSTEM_FAILURE_MARKER });
    }

    if (
        historyLimit !== null &&
        historyLimit > 0 &&
        messages.length > historyLimit
    ) {
        return messages.slice(-historyLimit);
    }
    return messages;
}

/**
 * 为模板变量 {{_BI_history}} 加载当前 agent 的历史。
 *
 * 语义：返回值与"本次 run 喂给 LLM 的 prior messages"完全一致，
 * 是 AI SDK 的 ModelMessage[]，模板可直接用 `_BI_history.length` 或迭代。
 *
 *   - 根 agent：从 PrjDB 读取会话历史，按 settings.history 截断；
 *     排除本轮 user 消息（ctx.msgId）与 assistant 占位（state.messageId），
 *     避免"历史"与本轮输入重叠。
 *   - 子 agent：从 PacRunState.subAgentHistories 按 compiled.id 读取，
 *     按 resolveSubAgentHistoryLimit(settings.history) 截断，与执行路径一致。
 *
 * 返回值恒为数组（可能为空），不会返回 undefined / 字符串，便于模板做
 * `.length` 判断与 `{{#each}}` 迭代。
 */
export async function loadHistoryForTemplate(
    ctx: IRunnerContext,
    state: PacRunState,
    compiled: CompiledPacAgent,
    isRoot: boolean,
): Promise<ModelMessage[]> {
    const settings = compiled.settings;

    if (isRoot) {
        const exclude = [ctx.msgId, state.messageId].filter(
            (id): id is string => typeof id === "string" && id.length > 0,
        );
        return loadPriorMessages(
            ctx,
            compiled.id,
            settings.history,
            settings.history !== 0,
            true,
            exclude,
        );
    }

    const limit = resolveSubAgentHistoryLimit(settings.history);
    return loadSubAgentPriorMessages(state, compiled.id, limit);
}

/**
 * 为模板变量 {{_BI_histories}} 构建整树历史对象。
 *
 * 返回值的 key 语义：
 *   - "root"         : 完整会话历史（不受任何 agent 的 settings.history 约束）。
 *                      始终从 PrjDB 读取，排除本轮 user / assistant 占位。
 *                      persist=false 时 PrjDB 无落库数据，.root 为空数组。
 *   - "<compiled.id>": 指定子 agent 的内存历史（浅拷贝）。
 *                      compiled.id 即"相对 rootBase 的源文件路径去 .md"，
 *                      例如 "sub/foo"、"research/web"。
 *
 * 访问含 `/` 或 `.` 的 key 时，模板请使用 Handlebars 标准 `lookup`：
 *
 *   {{#each (lookup _BI_histories "sub/foo")}} ... {{/each}}
 *
 * 使用场景：父 agent 在反思场景下需要读取某个子 agent 的对话轨迹，
 * 用变量直接获取比走一次 tool 调用（额外一轮 LLM round-trip）更高效。
 */
export async function buildHistoriesMap(
    ctx: IRunnerContext,
    state: PacRunState,
): Promise<Record<string, ModelMessage[]>> {
    const exclude = [ctx.msgId, state.messageId].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
    );

    const rootHistory = await loadPriorMessages(
        ctx,
        "__root__",
        null, // 不截断：反思场景需要完整上下文
        true,
        true,
        exclude,
    );

    const out: Record<string, ModelMessage[]> = { root: rootHistory };
    for (const [id, msgs] of state.subAgentHistories) {
        out[id] = msgs.slice();
    }
    return out;
}