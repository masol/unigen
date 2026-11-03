// packages/main/src/libs/project/controllers/drizzle/chat.ts
//
// 聊天域 (sessions / messages / traces) 的 CRUD。
//
// 原则:
//   - 时间戳一律 epoch ms (INTEGER)。
//   - Trace 行独立持久化，仅靠 (id, parentId) 关联；
//     支持流式增量写入 (upsertTrace / patchTrace / appendTraceDetail)，
//     读取时对缺失父节点或非法关系做容错 (挂到根)，保证返回最小可用且结构完整。
//   - FK 名义声明；运行期 pragma foreign_keys = OFF，故删除做手工级联。

import {
    messages,
    sessions,
    traces,
    type TraceExtra,
} from "$libs/utils/db/schema/chat.js";
import { throwPrecondition } from "$libs/utils/err.js";
import type {
    AgentIdentity,
    ChatMessage,
    ChatSession,
    GetMessageOptions,
    ListMessagesParams,
    ListSessionsParams,
    NewChatMessage,
    NewChatSession,
    TraceAgentNode,
    TraceNode,
    TracePatch,
} from "$types/shared/chat.js";
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { DrizzleDBType } from "./type.js";

/* ============================================================
 *  Sessions
 * ============================================================ */

const AUTO_TITLE_MAX = 30;

/**
 * 从用户消息内容推导自动标题。
 * - 折叠连续空白为单空格
 * - 截断到 AUTO_TITLE_MAX，超长补 '…'
 * - 空字符串返回空（调用方应判空）
 */
function deriveAutoTitle(content: string): string {
    const trimmed = (content ?? "").replace(/\s+/g, " ").trim();
    if (!trimmed) return "";
    if (trimmed.length <= AUTO_TITLE_MAX) return trimmed;
    return trimmed.slice(0, AUTO_TITLE_MAX) + "…";
}

export function createSession(
    db: DrizzleDBType,
    input: NewChatSession = {}
): string {
    const id = input.id ?? crypto.randomUUID();
    const now = input.createdAt ?? Date.now();
    const title = input.title ?? "";
    // 显式指定了非空标题视为"手动"，否则置 false 等自动标题
    const titleManual = input.titleManual ?? (title.length > 0);
    db.insert(sessions)
        .values({
            id,
            title,
            titleManual,
            createdAt: now,
            updatedAt: now,
            lastMessageAt: null,
            messageCount: 0,
        })
        .onConflictDoNothing()
        .run();
    return id;
}

export function getSession(
    db: DrizzleDBType,
    id: string
): ChatSession | null {
    if (!id) return null;
    const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
    return row ? rowToSession(row) : null;
}

export function listSessions(
    db: DrizzleDBType,
    params: ListSessionsParams = {}
): ChatSession[] {
    const {
        pageIndex = 0,
        pageSize = 50,
        orderBy = "lastMessageAt",
        orderDir = "desc",
    } = params;

    const col =
        orderBy === "createdAt"
            ? sessions.createdAt
            : orderBy === "updatedAt"
                ? sessions.updatedAt
                : sessions.lastMessageAt;
    const dir = orderDir === "asc" ? asc : desc;

    const rows = db
        .select()
        .from(sessions)
        .orderBy(dir(col), desc(sessions.createdAt))
        .limit(pageSize)
        .offset(pageIndex * pageSize)
        .all();
    return rows.map(rowToSession);
}

/**
 * 修改会话标题。
 *
 * @param manual 是否为用户手动改题。
 *   - true: 直接覆盖并置 title_manual=1，自此自动标题不再触发。
 *   - false (默认): 仅在 title_manual=0 时才覆盖，用户已改过则静默跳过。
 */
export function updateSessionTitle(
    db: DrizzleDBType,
    id: string,
    title: string,
    manual: boolean = false
): void {
    if (!id) throwPrecondition("updateSessionTitle: id is required");
    const now = Date.now();
    if (manual) {
        db.update(sessions)
            .set({ title, titleManual: true, updatedAt: now })
            .where(eq(sessions.id, id))
            .run();
    } else {
        db.update(sessions)
            .set({ title, updatedAt: now })
            .where(
                and(eq(sessions.id, id), eq(sessions.titleManual, false))
            )
            .run();
    }
}

/**
 * 删除会话 + 其下所有 messages + 所有 traces (手工级联)
 */
export function deleteSession(db: DrizzleDBType, id: string): void {
    if (!id) return;
    db.transaction((tx) => {
        const msgIds = tx
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.sessionId, id))
            .all()
            .map((r) => r.id);
        if (msgIds.length > 0) {
            tx.delete(traces).where(inArray(traces.messageId, msgIds)).run();
            tx.delete(messages).where(eq(messages.sessionId, id)).run();
        }
        tx.delete(sessions).where(eq(sessions.id, id)).run();
    });
}

function rowToSession(row: typeof sessions.$inferSelect): ChatSession {
    return {
        id: row.id,
        title: row.title,
        titleManual: row.titleManual,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastMessageAt: row.lastMessageAt ?? undefined,
        messageCount: row.messageCount,
    };
}

/* ============================================================
 *  Messages
 * ============================================================ */

/**
 * 幂等保存消息 (以 id 为键的 upsert)。
 *
 * - 不存在: 插入 + 会话 messageCount += 1 + lastMessageAt 刷新
 *           + 若为 user 消息且会话仍未手动改题/标题为空，则自动生成标题
 * - 已存在: 覆盖主体字段 (content/isError/agent/timestamp)，不改 messageCount
 */
export function saveMessage(
    db: DrizzleDBType,
    msg: NewChatMessage
): string {
    if (!msg.sessionId) {
        throwPrecondition("saveMessage: sessionId is required");
    }
    const id = msg.id ?? crypto.randomUUID();
    const ts = msg.timestamp ?? Date.now();

    db.transaction((tx) => {
        const existing = tx
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.id, id))
            .get();

        if (existing) {
            tx.update(messages)
                .set({
                    content: msg.content,
                    isError: msg.isError ?? false,
                    agent: msg.agent ?? null,
                    timestamp: ts,
                })
                .where(eq(messages.id, id))
                .run();

            tx.update(sessions)
                .set({ lastMessageAt: ts, updatedAt: Date.now() })
                .where(eq(sessions.id, msg.sessionId))
                .run();
        } else {
            tx.insert(messages)
                .values({
                    id,
                    sessionId: msg.sessionId,
                    role: msg.role,
                    content: msg.content,
                    isError: msg.isError ?? false,
                    agent: msg.agent ?? null,
                    timestamp: ts,
                })
                .run();

            tx.update(sessions)
                .set({
                    lastMessageAt: ts,
                    updatedAt: Date.now(),
                    messageCount: sql`${sessions.messageCount} + 1`,
                })
                .where(eq(sessions.id, msg.sessionId))
                .run();

            // 自动标题：首条 user 消息驱动，且未被用户手动改过
            if (msg.role === "user") {
                const auto = deriveAutoTitle(msg.content);
                if (auto) {
                    tx.update(sessions)
                        .set({ title: auto })
                        .where(
                            and(
                                eq(sessions.id, msg.sessionId),
                                eq(sessions.titleManual, false),
                                eq(sessions.title, "")
                            )
                        )
                        .run();
                }
            }
        }
    });

    return id;
}

export function getMessage(
    db: DrizzleDBType,
    id: string,
    opts: GetMessageOptions = {}
): ChatMessage | null {
    if (!id) return null;
    const row = db.select().from(messages).where(eq(messages.id, id)).get();
    if (!row) return null;
    const msg = rowToMessage(row);
    if (opts.withTraces) {
        msg.traces = listTracesByMessage(db, msg.id);
    }
    return msg;
}

export function listMessages(
    db: DrizzleDBType,
    params: ListMessagesParams
): ChatMessage[] {
    const {
        sessionId,
        withTraces = false,
        before,
        after,
        limit = 500,
        orderDir = "asc",
    } = params;

    if (!sessionId) {
        throwPrecondition("listMessages: sessionId is required");
    }

    const conds = [eq(messages.sessionId, sessionId)];
    if (before !== undefined) conds.push(lt(messages.timestamp, before));
    if (after !== undefined) conds.push(gt(messages.timestamp, after));

    const dir = orderDir === "asc" ? asc : desc;

    const rows = db
        .select()
        .from(messages)
        .where(and(...conds))
        .orderBy(dir(messages.timestamp), dir(messages.id))
        .limit(limit)
        .all();

    const result = rows.map(rowToMessage);

    if (withTraces && result.length > 0) {
        // 一次性拉取所有 traces 再按 messageId 分组，避免 N+1
        const msgIds = result.map((m) => m.id);
        const traceRows = db
            .select()
            .from(traces)
            .where(inArray(traces.messageId, msgIds))
            .orderBy(asc(traces.createdAt), asc(traces.id))
            .all();
        const byMsg = new Map<string, typeof traceRows>();
        for (const r of traceRows) {
            const arr = byMsg.get(r.messageId);
            if (arr) arr.push(r);
            else byMsg.set(r.messageId, [r]);
        }
        for (const m of result) {
            const trs = byMsg.get(m.id);
            if (trs && trs.length > 0) m.traces = buildTraceTree(trs);
        }
    }

    return result;
}

/**
 * 删除单条消息 + 其所有 traces + session.messageCount -=1 (手工级联)
 */
export function deleteMessage(db: DrizzleDBType, id: string): void {
    if (!id) return;
    db.transaction((tx) => {
        const existing = tx
            .select({ sessionId: messages.sessionId })
            .from(messages)
            .where(eq(messages.id, id))
            .get();
        if (!existing) return;

        tx.delete(traces).where(eq(traces.messageId, id)).run();
        tx.delete(messages).where(eq(messages.id, id)).run();

        tx.update(sessions)
            .set({
                messageCount: sql`MAX(${sessions.messageCount} - 1, 0)`,
                updatedAt: Date.now(),
            })
            .where(eq(sessions.id, existing.sessionId))
            .run();
    });
}

/**
 * 流式增量追加消息内容。原子拼接，不涉及读取修改写回。
 * 用于流式生成消息时，定期落库增量。
 */
export function appendMessageDelta(
    db: DrizzleDBType,
    messageId: string,
    delta: string
): void {
    if (!messageId || !delta) return;
    db.update(messages)
        .set({ content: sql`COALESCE(${messages.content}, '') || ${delta}` })
        .where(eq(messages.id, messageId))
        .run();
}

/**
 * 完成消息：设置最终内容、错误标记、agent 身份。
 * 同时刷新所属会话的 updatedAt。
 */
export function finishMessage(
    db: DrizzleDBType,
    messageId: string,
    opts: { content?: string; isError?: boolean; agent?: AgentIdentity } = {}
): void {
    if (!messageId) return;

    const set: Partial<typeof messages.$inferInsert> = {};
    if (opts.content !== undefined) set.content = opts.content;
    if (opts.isError !== undefined) set.isError = opts.isError;
    if (opts.agent !== undefined) set.agent = opts.agent;
    set.timestamp = Date.now();

    db.transaction((tx) => {
        tx.update(messages).set(set).where(eq(messages.id, messageId)).run();

        // 刷新会话 updatedAt
        const msg = tx
            .select({ sessionId: messages.sessionId })
            .from(messages)
            .where(eq(messages.id, messageId))
            .get();
        if (msg) {
            tx.update(sessions)
                .set({ updatedAt: Date.now() })
                .where(eq(sessions.id, msg.sessionId))
                .run();
        }
    });
}

function rowToMessage(row: typeof messages.$inferSelect): ChatMessage {
    return {
        id: row.id,
        sessionId: row.sessionId,
        role: row.role,
        content: row.content,
        isError: row.isError || undefined,
        timestamp: row.timestamp,
        agent: row.agent ?? undefined,
    };
}

/* ============================================================
 *  Traces —— 增量 (流式) 写入
 * ============================================================ */

/**
 * 流式插入或更新一个 trace 节点。
 *
 * 幂等语义：
 *   - 首次插入：写入全部字段并钉死 createdAt (作为后续排序键)
 *   - 已存在重入：更新除 createdAt 之外的所有字段 (支持重放)
 *
 * 用于响应 trace.start 事件。parent 可以尚未落库，读取时容错处理。
 */
export function upsertTrace(
    db: DrizzleDBType,
    messageId: string,
    parentId: string | null | undefined,
    node: TraceNode
): void {
    if (!messageId) throwPrecondition("upsertTrace: messageId is required");
    if (!node?.id) throwPrecondition("upsertTrace: node.id is required");

    const row = nodeToRow(messageId, node, parentId ?? null);

    db.insert(traces)
        .values({ ...row, createdAt: Date.now() })
        .onConflictDoUpdate({
            target: traces.id,
            // 不更新 createdAt，保持首次入库顺序
            set: {
                messageId: row.messageId,
                parentId: row.parentId,
                kind: row.kind,
                status: row.status,
                title: row.title,
                description: row.description,
                detail: row.detail,
                startedAt: row.startedAt,
                finishedAt: row.finishedAt,
                extra: row.extra,
            },
        })
        .run();
}

/**
 * 部分更新 trace 节点的可变字段。
 * 用于响应 trace.update 事件。
 * 若 nodeId 不存在则静默无动作 (事件乱序到达的容错)。
 */
export function patchTrace(
    db: DrizzleDBType,
    nodeId: string,
    patch: TracePatch
): void {
    if (!nodeId) return;
    const keys = Object.keys(patch) as (keyof TracePatch)[];
    if (keys.length === 0) return;

    // 只放行白名单字段，拒绝越权写入 id / kind / parentId 等
    const allowed: Partial<typeof traces.$inferInsert> = {};
    for (const k of keys) {
        const v = patch[k];
        if (v === undefined) continue;
        (allowed as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(allowed).length === 0) return;

    db.update(traces).set(allowed).where(eq(traces.id, nodeId)).run();
}

/**
 * 向 trace 节点的 detail 追加字符串。
 * 用于响应 trace.detail.delta 事件；SQL 原子拼接，无需读取-修改-写回。
 * 若 nodeId 不存在则静默无动作。
 */
export function appendTraceDetail(
    db: DrizzleDBType,
    nodeId: string,
    delta: string
): void {
    if (!nodeId || !delta) return;
    db.update(traces)
        .set({ detail: sql`COALESCE(${traces.detail}, '') || ${delta}` })
        .where(eq(traces.id, nodeId))
        .run();
}

/* ============================================================
 *  Traces —— 快照 (批量) 写入 / 读取
 * ============================================================ */

/**
 * 以一次事务重置某条消息的全部 traces 树 (snapshot 写入)。
 *
 * 使用场景：导入历史会话、灾难恢复，或主进程完成一次 run 后做一次性校正。
 * 不适合流式路径——流式路径请使用 upsertTrace / patchTrace / appendTraceDetail。
 */
export function saveTraces(
    db: DrizzleDBType,
    messageId: string,
    tree: TraceNode[] | undefined
): void {
    if (!messageId) throwPrecondition("saveTraces: messageId is required");

    const rows: Array<typeof traces.$inferInsert> = [];
    let seq = 0;
    const base = Date.now();

    const flatten = (nodes: TraceNode[], parentId: string | null) => {
        for (const n of nodes) {
            rows.push({
                ...nodeToRow(messageId, n, parentId),
                // 按前序遍历分配递增 createdAt，保证兄弟顺序稳定
                createdAt: base + seq++,
            });
            if (n.kind === "agent" && n.children.length > 0) {
                flatten(n.children, n.id);
            }
        }
    };
    if (tree && tree.length > 0) flatten(tree, null);

    db.transaction((tx) => {
        tx.delete(traces).where(eq(traces.messageId, messageId)).run();
        if (rows.length > 0) tx.insert(traces).values(rows).run();
    });
}

export function listTracesByMessage(
    db: DrizzleDBType,
    messageId: string
): TraceNode[] {
    if (!messageId) return [];
    const rows = db
        .select()
        .from(traces)
        .where(eq(traces.messageId, messageId))
        .orderBy(asc(traces.createdAt), asc(traces.id))
        .all();
    return buildTraceTree(rows);
}

/* ---------- Trace helpers ---------- */

function nodeToRow(
    messageId: string,
    node: TraceNode,
    parentId: string | null
): typeof traces.$inferInsert {
    const extra: TraceExtra | null = (() => {
        switch (node.kind) {
            case "agent":
                return { kind: "agent", agent: node.agent };
            case "tool":
                return {
                    kind: "tool",
                    toolName: node.toolName,
                    errorText: node.errorText,
                };
            case "source":
                return { kind: "source", url: node.url };
            case "step":
                return { kind: "step", icon: node.icon };
            case "reasoning":
                return { kind: "reasoning" };
            case "input":
                return { kind: "input" };
            case "output":
                return { kind: "output" };
        }
    })();

    return {
        id: node.id,
        messageId,
        parentId,
        kind: node.kind,
        status: node.status,
        title: node.title,
        description: node.description ?? null,
        detail: node.detail ?? null,
        startedAt: node.startedAt ?? null,
        finishedAt: node.finishedAt ?? null,
        extra,
    };
}

function rowToTraceNode(row: typeof traces.$inferSelect): TraceNode {
    const extra = row.extra as TraceExtra | null;
    const base = {
        id: row.id,
        status: row.status,
        title: row.title,
        description: row.description ?? undefined,
        detail: row.detail ?? undefined,
        startedAt: row.startedAt ?? undefined,
        finishedAt: row.finishedAt ?? undefined,
    };
    switch (row.kind) {
        case "agent":
            return {
                ...base,
                kind: "agent",
                agent: extra?.kind === "agent" ? extra.agent : { name: "", id: row.id },
                children: [],
            };
        case "tool":
            return {
                ...base,
                kind: "tool",
                toolName: extra?.kind === "tool" ? extra.toolName : "",
                errorText: extra?.kind === "tool" ? extra.errorText : undefined,
            };
        case "source":
            return {
                ...base,
                kind: "source",
                url: extra?.kind === "source" ? extra.url : "",
            };
        case "step":
            return {
                ...base,
                kind: "step",
                icon: extra?.kind === "step" ? extra.icon : undefined,
            };
        case "reasoning":
            return { ...base, kind: "reasoning" };
        case "input":
            return { ...base, kind: "input" };
        case "output":
            return { ...base, kind: "output" };
    }
}

/**
 * 平铺行 → 嵌套 TraceNode 树。
 *
 * 容错策略 (保持"最小可用，结构完整")：
 *   - parentId 指向不存在的节点  → 挂到根
 *   - parentId 指向非 agent 节点 → 挂到根
 *   - 其余按正常父子关系嵌入 children
 */
function buildTraceTree(
    rows: Array<typeof traces.$inferSelect>
): TraceNode[] {
    const map = new Map<string, TraceNode>();
    for (const r of rows) map.set(r.id, rowToTraceNode(r));

    const roots: TraceNode[] = [];
    for (const r of rows) {
        const node = map.get(r.id)!;
        if (r.parentId) {
            const parent = map.get(r.parentId);
            if (parent && parent.kind === "agent") {
                (parent as TraceAgentNode).children.push(node);
                continue;
            }
            // 父丢失或类型非法：降级为根节点
        }
        roots.push(node);
    }
    return roots;
}