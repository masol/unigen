import type { IRunnerContext } from "$types/blueprint/context.js";
import type { ModelMessage } from "ai";
import Logger from "electron-log/main.js";

/**
 * History 存取接口。
 *
 * 契约:
 *   - 以 (prj, id) 为复合键定位某组历史消息
 *   - id 由 buildHistoryId() 构造,形如 `${sessId}:${agentId}`
 *   - read(limit)  按时间升序返回最近 limit 条(最后一条最新);
 *                  limit 为 undefined 表示返回全部
 *   - append       追加一条消息
 *   - clear        清空指定 id 的全部历史
 *
 * 实现由宿主通过 registerHistoryStore() 注入;未注入时为空实现,
 * read 返回空数组,append/clear 为 no-op——此时 agent 行为等价于关闭历史。
 */
export interface HistoryStore {
    read(prj: unknown, id: string, limit?: number): Promise<ModelMessage[]>;
    append(prj: unknown, id: string, message: ModelMessage): Promise<void>;
    clear(prj: unknown, id: string): Promise<void>;
}

const stubStore: HistoryStore = {
    async read() { return []; },
    async append() { /* no-op, awaiting registerHistoryStore() */ },
    async clear() { /* no-op, awaiting registerHistoryStore() */ },
};

let activeStore: HistoryStore = stubStore;

/** 注入 HistoryStore 实现。宿主启动时调用一次。 */
export function registerHistoryStore(store: HistoryStore): void {
    activeStore = store;
    Logger.debug("[PAC] HistoryStore 已注入");
}

export function getHistoryStore(): HistoryStore {
    return activeStore;
}

/**
 * 组合历史 id = `${sessId}:${agentId}`。
 * sessId 缺失时退化为 "default:" 前缀并告警(同一 agent 的所有会话会混在一起)。
 */
export function buildHistoryId(ctx: IRunnerContext, agentId: string): string {
    const sessId = (ctx as unknown as { sessId?: string }).sessId;
    if (!sessId) {
        Logger.warn(`[PAC] ctx.sessId 缺失,历史退化为单会话模式 (agent=${agentId})`);
        return `default:${agentId}`;
    }
    return `${sessId}:${agentId}`;
}

/**
 * 系统标注:上次 assistant 回合缺失/失败的占位内容。
 *
 * 用 XML 风格的标签让 LLM 识别为元数据而非普通对话内容;
 * 现代 instruct 模型(Claude / GPT-4o / Gemini)都能稳定理解这类标签并忽略它们。
 */
export const SYSTEM_FAILURE_MARKER =
    "<system-note>Previous assistant turn failed to produce output; " +
    "disregard it and answer the current user message directly.</system-note>";

/**
 * 读取某 agent 的历史消息。
 *
 * @param limit null → 全部;0 → 空;N>0 → 最近 N 条
 *
 * **防御性配对修复**:若读到的末尾是 user 消息(可能来自进程崩溃或 store 写一半),
 * 自动追加一条占位 assistant 消息并持久化,保证返回的消息序列成对。
 */
export async function loadHistoryMessages(
    ctx: IRunnerContext,
    agentId: string,
    limit: number | null,
): Promise<ModelMessage[]> {
    if (limit === 0) return [];
    const id = buildHistoryId(ctx, agentId);
    let raw: ModelMessage[];
    try {
        const r = await activeStore.read(ctx.prj, id, limit ?? undefined);
        raw = Array.isArray(r) ? r.slice() : [];
    } catch (e) {
        Logger.warn(`[PAC] 读取历史失败 (agent=${agentId}):`, e);
        return [];
    }

    if (raw.length > 0 && raw[raw.length - 1].role === "user") {
        Logger.warn(
            `[PAC] 历史末尾是孤立 user 消息,追加占位 assistant 补齐 (agent=${agentId})`,
        );
        const placeholder: ModelMessage = {
            role: "assistant",
            content: SYSTEM_FAILURE_MARKER,
        };
        try {
            await activeStore.append(ctx.prj, id, placeholder);
        } catch (e) {
            Logger.warn(`[PAC] 持久化占位 assistant 失败,仅在内存中修复 (agent=${agentId}):`, e);
        }
        raw.push(placeholder);
    }

    return raw;
}

/** 追加一条消息到某 agent 的历史。 */
export async function appendHistoryMessage(
    ctx: IRunnerContext,
    agentId: string,
    message: ModelMessage,
): Promise<void> {
    try {
        const id = buildHistoryId(ctx, agentId);
        await activeStore.append(ctx.prj, id, message);
    } catch (e) {
        Logger.warn(`[PAC] 追加历史失败 (agent=${agentId}):`, e);
    }
}

/** 清空某 agent 的历史(供外部手动清理)。 */
export async function clearHistory(ctx: IRunnerContext, agentId: string): Promise<void> {
    try {
        const id = buildHistoryId(ctx, agentId);
        await activeStore.clear(ctx.prj, id);
    } catch (e) {
        Logger.warn(`[PAC] 清空历史失败 (agent=${agentId}):`, e);
    }
}

/**
 * 以 JSON 字符串形式加载历史,供模板变量 {{_BI_history}} 使用。
 * 注意:模板渲染在"调用 generate 之前",读到的历史不含本轮 user 消息。
 */
export async function loadHistoryVar(
    ctx: IRunnerContext,
    agentId: string,
    limit: number | null,
): Promise<string> {
    const messages = await loadHistoryMessages(ctx, agentId, limit);
    return JSON.stringify(messages, null, 2);
}