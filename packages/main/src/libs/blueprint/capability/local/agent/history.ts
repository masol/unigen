// packages/main/src/libs/blueprint/capability/local/agent/history.ts
//
// 会话历史的唯一入口。
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
//   - 仅 root agent 读会话历史;子 agent 作为工具,上下文由 inputs 显式传入,
//     不应感知会话流。这个边界在本模块里强制执行。

import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { ChatMessage } from "$types/shared/chat.js";
import type { ModelMessage } from "ai";
import Logger from "electron-log/main.js";

/**
 * 系统标注: 上一轮 assistant 回合缺失或失败的占位。
 *
 * 用 XML 风格标签让 LLM 把它识别为元数据而非普通对话;
 * Claude / GPT-4o / Gemini 等主流 instruct 模型都能稳定理解并忽略它。
 */
export const SYSTEM_FAILURE_MARKER =
    "<system-note>Previous assistant turn failed to produce output; " +
    "disregard it and answer the current user message directly.</system-note>";

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
 * 加载当前会话历史,供 agent 执行使用。
 *
 * @param historyLimit  null → 全部;0 → 空;N > 0 → 最近 N 条
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
 * 以 JSON 字符串形式加载历史,供模板变量 {{_BI_history}} 使用。
 *
 * 模板语义: 任何 agent 的模板只要显式引用 {{_BI_history}},
 * 都返回会话历史的 JSON 序列化,规则与 loadPriorMessages(isRoot=true) 一致。
 */
export async function loadHistoryVar(
    ctx: IRunnerContext,
    agentId: string,
    historyLimit: number | null,
): Promise<string> {
    const messages = await loadPriorMessages(
        ctx,
        agentId,
        historyLimit,
        true, // histEnabled
        true, // isRoot: 模板显式索取,统一按 root 处理
    );
    return JSON.stringify(messages, null, 2);
}