// packages/renderer/src/lib/store/local/msg.svelte.ts
// src/lib/store/local/msg.svelte.ts
import { projectStore } from "$lib/store/project.svelte";
import { safeApi } from "$lib/utils/api";
import evtbus from "$lib/utils/evtbus";
import { hooks } from "$lib/utils/hook";
import { truncate } from '$lib/utils/str';
import type { BuiltinTool } from "@app/main/types";
import log from 'electron-log/renderer';
import Logger from "electron-log/renderer.js";
import pTimeout, { TimeoutError } from "p-timeout";
import { toast } from "svelte-sonner";

import { hasTraceChildren, isTraceAgentNode } from "./chat.guards";
import type {
    ChatMessage,
    ChatStreamEvent,
    TraceNode
} from "./chat.types";
import { sessionStore } from "./session.store.svelte";

export type { BuiltinTool } from "@app/main/types";

const RUNCOMMAND_END_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * 输入栏已选项（工具 / 技能通用）。
 * 保存完整展示信息，使菜单重新打开时已选区无需再次请求即可直接渲染。
 */
export type SelectedItem = {
    id: string;
    name: string;
    description?: string;
};

type SeqDeferred = {
    promise: Promise<boolean>;
    resolve: (suc: boolean) => void;
};

type RunState = {
    seq: number;
    sessionId: string;
    controller: AbortController;
    promise: Promise<void> | null;
    deferred: SeqDeferred;
    activeAssistantId: string | null;
    aborting: boolean;
};

function createDeferred(): SeqDeferred {
    let resolve!: (suc: boolean) => void;
    const promise = new Promise<boolean>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

function newId(): string {
    return crypto?.randomUUID?.() ?? Date.now().toString();
}

class MessageStore {
    constructor() {
        evtbus.on("runcommand-end", ({ suc, seq }) => {
            const state = this.#runsBySeq.get(seq);
            if (state) {
                this.#runsBySeq.delete(seq);
                state.deferred.resolve(suc);
            } else {
                Logger.debug("runcommand-end received with no pending waiter", {
                    suc,
                    seq,
                });
            }
        });
        evtbus.on("switch-session", ({ state }) => {
            if (state === "start") {
                this.isReloading = true;
            } else if (state == "failed") {
                this.isReloading = false;
            }
        });
        hooks.hook("session:changed", async () => {
            //active session变化了，开始加载其message list.
            await this.reload();
            this.#syncRunStateForActive();
        })

        // hooks.hook("project:loaded", () => {
        //     //项目加载完毕，清空已选择的skills和tools.
        //     this.selectedSkills = [];
        //     this.selectedTools = [];
        // })
    }

    // ── Public reactive state ───────────────────────────────────
    messages = $state<ChatMessage[]>([]);
    isLoading = $state(false);
    isAborting = $state(false);

    /** 消息列表同步加载中：与 AI 运行中的 isLoading 分开，避免 BlockUI 误伤流式回答 */
    isReloading = $state(true);

    /**
     * 全局删除/清理操作进行中。
     * 用于在删除、清空、编辑后重跑等异步操作期间禁用输入发送，避免状态竞争。
     */
    isDeleting = $state(false);

    /** 每条消息的「删除中」状态：用于单条消息按钮显示转圈 */
    deletingMessages = $state<Record<string, boolean>>({});

    collapsedMessages = $state<Record<string, boolean>>({});

    /**
     * 全局思考信息（trace）显示开关。
     * 由 WorkbenchHeader 统一控制全部消息的 trace 显隐，
     * AssistantMessage 通过读取该字段决定是否渲染 AgentTrace。
     */
    tracesVisible = $state(true);

    /**
     * 输入栏已选工具（内建 + 检索结果，可混选）。
     * 保存完整信息（id + 展示字段），使菜单重新打开时已选区无需再次请求即可渲染。
     * 唯一真源：ChatInput / ChatInputToolbar / PickerMenu 均读写本字段。
     * 发送后不自动清空，由用户显式操作（或在业务需要时由调用方重置）。
     */
    selectedTools = $state<SelectedItem[]>([]);

    /**
     * 输入栏已选技能。
     * 保存完整信息（id + 展示字段），使菜单重新打开时已选区无需再次请求即可渲染。
     * 唯一真源：ChatInput / ChatInputToolbar / PickerMenu 均读写本字段。
     * 发送后不自动清空，由用户显式操作（或在业务需要时由调用方重置）。
     */
    selectedSkills = $state<SelectedItem[]>([]);

    /** 内建工具列表；系统启动后由 init 通过主进程 API 初始化 */
    builtinTools = $state<BuiltinTool[]>([]);

    hasMessages = $derived(this.messages.length > 0);
    lastMessage = $derived(
        this.messages.length > 0
            ? this.messages[this.messages.length - 1]
            : null,
    );

    // ── Internals ───────────────────────────────────────────────
    #nextSeq = 1;

    /**
     * 一次 run 的全部内部状态都收敛到 RunState 中：
     * - 按 sessionId 查找：用于会话级锁定、abort、切换会话时恢复 UI 状态；
     * - 按 seq 查找：用于承接主进程 runcommand-end 确认事件。
     *
     * 原 #pendingSeqs 已合并进 RunState.deferred，不再单独维护。
     */
    #runsBySession = new Map<string, RunState>();
    #runsBySeq = new Map<number, RunState>();

    /**
     * 系统启动时调用，用于初始化内建工具列表。
     *
     * 防御说明：safeApi() 在业务错误 / 路由未就绪等场景下可能返回 null
     * （参见 installSkill 中的相同防御），此处必须显式判空，否则会在
     * `result.tools` 上抛 TypeError 并打断 App 启动流程。
     * 初始化失败时不阻断应用启动，内建工具列表保持为空；调用方可后续重试。
     */
    async init(): Promise<void> {
        try {
            const result = await safeApi().agent.loadBuildin();
            if (!result) {
                Logger.error(
                    "[MessageStore] init builtin tools: loadBuildin 返回空结果（API 层可能尚未就绪或业务失败）",
                );
                return;
            }
            this.builtinTools = result.tools;
        } catch (err) {
            Logger.error("[MessageStore] init builtin tools failed", err);
        }
    }

    /**
     * 加载当前会话的消息列表。
     *
     * 恢复策略按「会话是否正在运行」分支：
     * - 未运行：#repairIdleMessages —— 当前已有的自动修复逻辑（streaming=false、
     *   forceEndTraces 把 running/pending 收尾为 success）。这是静止态的唯一正确策略。
     * - 运行中：#restoreRunningMessages —— 保留 activeAssistantId 对应消息的
     *   streaming 状态与 running/pending trace 节点，等待后续流事件续写；
     *   并以「内存快照优先」合并 DB 结果，避免流式内容在 reload 期间被 DB 的中间落盘覆盖。
     *
     * 原实现在 reload 中无条件整体替换，且没有任何修复或合并逻辑，
     * 导致运行中会话切回时状态无法正确恢复。
     */
    private async reload(): Promise<void> {
        const sid = sessionStore.activeSessionId
        // 运行判定以「内存 RunState 存在」为权威依据，sessionStore 的 running 标记
        // 仅为辅助：AIResponse 中先 set map 再 setRunning(true)，finally 中先 delete
        // map 再 setRunning(false)，两处均存在极短窗口，仅看 sessionStore 可能误判。
        const running = Boolean(
            sid && (sessionStore.isRunning(sid) || this.#runsBySession.has(sid)),
        )
        const runState = sid ? this.#runsBySession.get(sid) : undefined

        // 运行中：reload 前先抓取本会话的内存消息快照。
        // 切换会话场景下 filter 后通常为空（后台 run 不写入 messages）；
        // 非切换场景（项目重载等）下快照包含正在流式累积的内容，需在合并时优先保留。
        const liveSnapshot = running
            ? this.messages.filter((m) => m.sessionId === sid)
            : []

        this.messages = []
        log.debug('[MessageStore] reload() called', { sid, running })
        this.isReloading = true

        try {
            const loaded = await safeApi().project.listMessage({
                sessionId: sid,
                withTraces: true,
            })
            this.messages = running
                ? this.#restoreRunningMessages(loaded, runState, liveSnapshot)
                : this.#repairIdleMessages(loaded)
            this.selectedSkills = [];
            this.selectedTools = [];
            log.info(
                `[MessageStore] reload completed, loaded ${this.messages.length} messages, running=${running}`,
            )
        } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            toast.error(errMessage);
            log.error('[MessageStore] reload() failed', err)
        } finally {
            this.isReloading = false
        }
    }

    /**
     * 未运行会话的恢复：执行自动修复。
     *
     * 消息一旦不处于运行态，任何 streaming=true 或 status=running/pending 的
     * trace 都是异常落盘（进程中断、旧版本残留等），必须收尾，否则 UI 会永久转圈。
     *
     * 每条消息独立 try/catch：单条异常不应中断整批修复。
     */
    #repairIdleMessages(messages: ChatMessage[]): ChatMessage[] {
        if (!Array.isArray(messages)) return []
        for (const m of messages) {
            if (!m || typeof m !== "object") continue
            try {
                m.streaming = false
                this.#forceEndTraces(m)
            } catch (err) {
                Logger.error(
                    "[MessageStore] repairIdleMessages failed for message",
                    { messageId: (m as ChatMessage).id, err },
                )
            }
        }
        return messages
    }

    /**
     * 运行中会话的恢复：保留活跃流状态，清理无关僵尸态。
     *
     * - 以 DB 结果为基础，用内存快照覆盖同 id 消息（内存是活跃流，内容更权威）；
     * - activeAssistantId 指向的助手消息：强制 streaming=true，
     *   并调用 #reviveRunningTraces 恢复 trace 节点的 streaming 视觉标志
     *   （DB 落盘时 trace.status 通常保留为 running/pending，但 streaming
     *   字段未必同步落盘；不恢复则切回会话后 spinner 消失，而 input 仍被禁用）；
     * - 其它消息：在运行中会话里不应保持运行态（可能来自上一个已结束 run 的
     *   异常落盘），执行与静止态相同的修复。
     *
     * 防御：running 标记存在但 runState 缺失（理论不可达）时，无法定位活跃流，
     * 退化为全量修复，避免永久转圈。
     */
    #restoreRunningMessages(
        loaded: ChatMessage[],
        runState: RunState | undefined,
        liveSnapshot: ChatMessage[],
    ): ChatMessage[] {
        const safeLoaded = Array.isArray(loaded) ? loaded : []
        const safeSnapshot = Array.isArray(liveSnapshot) ? liveSnapshot : []
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const byId = new Map(safeLoaded.map((m) => [m.id, m]))
        for (const live of safeSnapshot) {
            byId.set(live.id, live)
        }
        const merged = Array.from(byId.values()).sort(
            (a, b) => a.timestamp - b.timestamp,
        )

        if (!runState) {
            Logger.warn(
                "[MessageStore] reload(): running 标记存在但 runState 缺失，退化为静止态修复",
            )
            return this.#repairIdleMessages(merged)
        }

        const activeId = runState.activeAssistantId
        if (activeId && !merged.some((m) => m.id === activeId)) {
            // 诊断：活跃消息尚未落盘（DB 写入延迟）。此时流事件到达时
            // #findMessage 将找不到该消息，内容可能丢失。仅告警，不改变行为。
            Logger.warn(
                "[MessageStore] reload(): activeAssistantId 在 DB 中未找到，流内容可能在 reload 窗口丢失",
                { activeId },
            )
        }

        for (const m of merged) {
            if (!m || typeof m !== "object") continue
            try {
                if (activeId && m.id === activeId && m.role === "assistant") {
                    // 活跃流：保留 streaming + 恢复 running/pending trace 的 spinner 视觉
                    m.streaming = true
                    this.#reviveRunningTraces(m)
                    continue
                }
                m.streaming = false
                this.#forceEndTraces(m)
            } catch (err) {
                Logger.error(
                    "[MessageStore] restoreRunningMessages failed for message",
                    { messageId: (m as ChatMessage).id, err },
                )
            }
        }
        return merged
    }

    // ── Message CRUD ────────────────────────────────────────────
    addMessage(partial: Omit<ChatMessage, "id" | "timestamp" | "sessionId">): ChatMessage {
        const msg: ChatMessage = {
            sessionId: sessionStore.activeSessionId ?? "error",
            id: newId(),
            timestamp: Date.now(),
            ...partial,
        };

        this.messages = [...this.messages, msg];
        sessionStore.updMessageCount();
        return msg;
    }

    /**
     * 清空当前会话的全部消息。
     * - 先调用 deleteMessagesAfter(fromTs = 0) 让后端清空；
     * - 成功后本地消息、折叠状态、活动助手 id 一并重置；
     * - 失败时保留本地状态，并提示用户。
     */
    async clear(): Promise<void> {
        if (this.isDeleting || this.isLoading || this.isReloading) return;

        const sid = sessionStore.activeSessionId;
        if (!sid) {
            // 没有活跃 session 时直接清空本地状态
            this.messages = [];
            this.collapsedMessages = {};
            return;
        }

        this.isDeleting = true;
        try {
            await safeApi().project.deleteMessagesAfter({ sid, fromTs: 0 });
            this.messages = [];
            this.collapsedMessages = {};
        } catch (err) {
            const errText = err instanceof Error ? err.message : String(err);
            toast.error(`清空会话失败：${errText}`);
            Logger.error("[MessageStore] clear() failed", err);
        } finally {
            this.isDeleting = false;
        }
    }

    /**
     * 删除单条消息，并按配对规则同时删除其配对消息：
     * - 删除用户消息：连带删除紧随其后的助手消息（直到下一个用户消息之前）；
     * - 删除助手消息：连带删除其提示用户消息，以及该用户消息之后的所有助手消息。
     *
     * 删除按条逐个进行，每条成功后立即更新本地状态，使部分失败时的 UI 与后端一致。
     */
    async deleteMessage(id: string): Promise<void> {
        if (this.isDeleting || this.isLoading || this.isReloading) {
            toast.error("当前有其他操作正在进行，请稍后");
            return;
        }

        const idx = this.messages.findIndex((m) => m.id === id);
        if (idx < 0) return;

        const { start, end } = this.#findPairBoundary(idx);
        const targets = this.messages.slice(start, end + 1);
        const ids = targets.map((m) => m.id);

        ids.forEach((mid) => { this.deletingMessages[mid] = true; });
        this.isDeleting = true;

        try {
            for (const mid of ids) {
                await safeApi().project.deleteMessage(mid);
                // 单条成功后立即从本地状态移除，保证部分失败时前后端一致
                this.messages = this.messages.filter((m) => m.id !== mid);
                delete this.collapsedMessages[mid];
                delete this.deletingMessages[mid];
            }
        } catch (err) {
            const errText = err instanceof Error ? err.message : String(err);
            toast.error(`删除失败：${errText}`);
            Logger.error("[MessageStore] deleteMessage() failed", { id, err });
        } finally {
            // 兜底清空转圈状态
            ids.forEach((mid) => { delete this.deletingMessages[mid]; });
            this.isDeleting = false;
        }
    }

    /**
     * 从指定用户消息处重新执行：
     * - 先 deleteMessagesAfter 删除该消息及其后所有消息（fromTs = target.timestamp - 1，
     *   假设 deleteMessagesAfter 语义为严格大于）；
     * - 再以原内容或编辑后的新内容重新创建一条用户消息；
     * - 最后走正常 AIResponse 流程。
     *
     * 用于「重新运行」与「编辑并重新运行」两个入口。
     */
    async resendFrom(messageId: string, newContent?: string): Promise<void> {
        if (this.isDeleting || this.isLoading || this.isReloading) {
            toast.error("当前有其他操作正在进行，请稍后");
            return;
        }
        if (!projectStore.opened) {
            toast.error("请先打开一个项目");
            return;
        }

        const idx = this.messages.findIndex((m) => m.id === messageId);
        if (idx < 0) return;
        const target = this.messages[idx];
        if (target.role !== "user") {
            toast.warning("只能从用户消息重新运行");
            return;
        }

        const sid = sessionStore.activeSessionId;
        if (!sid) return;

        // 假设 deleteMessagesAfter 语义为严格大于 → 用 timestamp - 1 一并删除目标消息本身
        const fromTs = target.timestamp - 1;

        this.isDeleting = true;
        try {
            await safeApi().project.deleteMessagesAfter({ sid, fromTs });
            // 本地同步裁剪（丢弃目标消息及其后所有消息）
            this.messages = this.messages.slice(0, idx);
        } catch (err) {
            const errText = err instanceof Error ? err.message : String(err);
            toast.error(`重新运行前的删除失败：${errText}`);
            Logger.error("[MessageStore] resendFrom() delete failed", err);
            return; // finally 会清理状态
        } finally {
            this.isDeleting = false;
        }

        // 重建用户消息并走正常流程（files 从历史消息恢复）
        const userMsg = this.addMessage({
            role: "user",
            content: newContent ?? target.content,
            files: target.files ?? [],
        });

        await this.AIResponse(userMsg);
    }

    /**
     * 在消息序列中定位「配对边界」：
     * - 用户消息：配对从自身开始，到下一个用户消息前的最后一条助手消息结束；
     * - 助手消息：向前回溯到最近的用户消息作为配对起点，向后延伸到下一个用户消息前的最后一条助手消息。
     */
    #findPairBoundary(idx: number): { start: number; end: number } {
        const target = this.messages[idx];
        let start = idx;
        let end = idx;

        if (target.role === "user") {
            for (let i = idx + 1; i < this.messages.length; i++) {
                if (this.messages[i].role === "user") break;
                end = i;
            }
        } else {
            for (let i = idx - 1; i >= 0; i--) {
                if (this.messages[i].role === "user") {
                    start = i;
                    break;
                }
            }
            for (let i = idx + 1; i < this.messages.length; i++) {
                if (this.messages[i].role === "user") break;
                end = i;
            }
        }

        return { start, end };
    }

    /**
     * 正式声明「重新生成」能力。
     * 当前尚未实现，先以 toast 提示占位，避免调用方通过
     * `messageStore as unknown as {...}` 做结构性探测。
     */
    async regenerate(messageId: string): Promise<void> {
        void messageId;
        toast.warning("重新生成功能尚未实现");
    }

    setLoading(loading: boolean) {
        this.isLoading = loading;
    }

    toggleMessage(messageId: string) {
        this.collapsedMessages[messageId] = !this.collapsedMessages[messageId];
    }

    toggleAllMessages() {
        if (this.messages.length === 0) return;
        const allCollapsed = this.messages.every(
            (m) => this.collapsedMessages[m.id] === true,
        );
        const target = !allCollapsed;
        this.messages.forEach((m) => {
            this.collapsedMessages[m.id] = target;
        });
    }

    toggleTracesVisible() {
        this.tracesVisible = !this.tracesVisible;
    }

    // ── Tree traversal helpers ──────────────────────────────────
    /**
     * 在消息的 trace 树中递归查找指定 id 的节点
     * 关键：直接在响应式树上操作，不使用 Map 缓存
     */
    #findTraceNode(
        messageId: string,
        nodeId: string,
    ): TraceNode | null {
        const msg = this.#findMessage(messageId);
        if (!msg || !Array.isArray(msg.traces)) return null;

        const search = (nodes: TraceNode[]): TraceNode | null => {
            if (!Array.isArray(nodes)) return null;
            for (const node of nodes) {
                if (!node) continue;
                if (node.id === nodeId) return node;
                if (hasTraceChildren(node) && Array.isArray(node.children)) {
                    const found = search(node.children);
                    if (found) return found;
                }
            }
            return null;
        };

        return search(msg.traces);
    }

    // ── Stream event handling ───────────────────────────────────
    handleStreamEvent(event: ChatStreamEvent, state?: RunState): void {
        switch (event.type) {
            case "message.start": {
                const msg: ChatMessage = {
                    id: event.messageId,
                    sessionId: event.sessionId,
                    role: "assistant",
                    content: "",
                    timestamp: event.timestamp,
                    streaming: true,
                    agent: event.agent,
                    traces: [],
                };
                this.messages = [...this.messages, msg];
                sessionStore.updMessageCount();
                if (state) state.activeAssistantId = event.messageId;
                break;
            }
            case "message.delta": {
                const m = this.#findMessage(event.messageId);
                if (m) {
                    // 防御：content 若因极端场景为 undefined / 非字符串，
                    // 直接 += 会产成 "undefined..." 污染，需先归一到字符串。
                    m.content =
                        (typeof m.content === "string" ? m.content : "") +
                        event.delta;
                }
                break;
            }
            case "message.end": {
                if (state && state.activeAssistantId === event.messageId) {
                    state.activeAssistantId = null;
                }
                const m = this.#findMessage(event.messageId);
                if (!m) break;
                m.streaming = false;
                if (event.content != null) {
                    m.content = event.content;
                }
                this.#forceEndTraces(m);
                break;
            }
            case "message.error": {
                if (state && state.activeAssistantId === event.messageId) {
                    state.activeAssistantId = null;
                }
                const m = this.#findMessage(event.messageId);
                if (!m) break;
                m.streaming = false;
                m.isError = true;
                m.content = event.error;
                this.#forceEndTraces(m);
                break;
            }
            case "trace.start": {
                const m = this.#findMessage(event.messageId);
                if (!m) break;
                if (!Array.isArray(m.traces)) {
                    m.traces = [];
                }

                if (event.parentId) {
                    const parent = this.#findTraceNode(event.messageId, event.parentId);
                    if (parent && isTraceAgentNode(parent)) {
                        if (!Array.isArray(parent.children)) {
                            parent.children = [];
                        }
                        parent.children.push(event.node);
                    } else {
                        Logger.warn(
                            "trace.start: parentId not found or not an agent node, mounting to root",
                            { parentId: event.parentId, nodeId: event.node.id },
                        );
                        m.traces.push(event.node);
                    }
                } else {
                    m.traces.push(event.node);
                }
                break;
            }
            case "trace.update": {
                const node = this.#findTraceNode(event.messageId, event.nodeId);
                if (node) {
                    Object.assign(node, event.patch);
                }
                break;
            }
            case "trace.detail.delta": {
                const node = this.#findTraceNode(event.messageId, event.nodeId);
                if (!node) {
                    Logger.warn("trace.detail.delta: node not found", {
                        nodeId: event.nodeId,
                    });
                    break;
                }

                node.detail = (node.detail ?? "") + event.delta;
                node.streaming = true;
                break;
            }
            case "trace.end": {
                const node = this.#findTraceNode(event.messageId, event.nodeId);
                if (!node) break;

                // 应用 trace.end 携带的完整 patch：
                // 协议中 description（含耗时/错误信息）、status、finishedAt 等
                // 都可能随 end 一起下发，不能只挑 status/finishedAt，
                // 否则实时视图会缺失 description（数据库加载时才可见）。
                if (event.patch) {
                    Object.assign(node, event.patch);
                }
                if (event.detail != null) node.detail = event.detail;

                // trace 已结束，最后统一置为终止态
                node.streaming = false;

                // 兜底终止逻辑：如果后端未设置终态，此处补齐
                if (node.status === "running" || node.status === "pending") {
                    node.status = "success";
                    if (!node.finishedAt) {
                        node.finishedAt = Date.now();
                    }
                }
                break;
            }
        }
    }

    #findMessage(id: string): ChatMessage | undefined {
        return this.messages.find((m) => m.id === id);
    }

    #forceEndTraces(message: ChatMessage): void {
        if (!Array.isArray(message.traces) || message.traces.length === 0) return;

        const endNode = (node: TraceNode) => {
            if (!node) return;
            if (node.status === "running" || node.status === "pending") {
                node.status = "success";
                node.streaming = false;
                if (!node.finishedAt) {
                    node.finishedAt = Date.now();
                }
            }
            if (hasTraceChildren(node) && Array.isArray(node.children)) {
                node.children.forEach(endNode);
            }
        };

        message.traces.forEach(endNode);
    }

    /**
     * 恢复运行中消息的 trace 视觉：
     * DB 落盘时 trace.status 通常保留为 running/pending，但 streaming 字段
     * 未必同步写入（服务端可能在 trace.end 才落盘 streaming）。若不补回，
     * 切回会话后 TraceNode 的 `isRunning = status==="running" && streaming`
     * 恒为 false，spinner 全部消失，而 input 仍因 isLoading/running 被禁用。
     *
     * 仅对 running/pending 节点补 streaming=true；已终态节点保持原样，
     * 避免把历史已完成节点误标为运行中。
     */
    #reviveRunningTraces(message: ChatMessage): void {
        if (!Array.isArray(message.traces) || message.traces.length === 0) return;

        const revive = (node: TraceNode) => {
            if (!node) return;
            if (node.status === "running" || node.status === "pending") {
                node.streaming = true;
            }
            if (hasTraceChildren(node) && Array.isArray(node.children)) {
                node.children.forEach(revive);
            }
        };

        message.traces.forEach(revive);
    }

    /**
     * 当会话不在前台时，不把事件写入当前 messages；
     * 但仍需跟踪该 run 的 activeAssistantId，供切回前台后的收尾使用。
     */
    #trackRunEvent(state: RunState, event: ChatStreamEvent): void {
        switch (event.type) {
            case "message.start": {
                state.activeAssistantId = event.messageId;
                break;
            }
            case "message.end":
            case "message.error": {
                if (state.activeAssistantId === event.messageId) {
                    state.activeAssistantId = null;
                }
                break;
            }
        }
    }

    #syncRunStateForActive(): void {
        const sid = sessionStore.activeSessionId;
        const state = sid ? this.#runsBySession.get(sid) : undefined;
        this.setLoading(Boolean(state));
        this.isAborting = state?.aborting ?? false;
    }

    // ── Run lifecycle ───────────────────────────────────────────
    async AIResponse(userMessage: ChatMessage, mode: string | null = null): Promise<void> {
        if (this.isDeleting) {
            toast.error("正在删除消息，请稍后");
            return;
        }
        if (this.isReloading) {
            toast.error("正在同步会话，请稍后");
            return;
        }
        if (!projectStore.opened) {
            toast.error("请先打开一个项目");
            return;
        }

        const sid = sessionStore.activeSessionId;
        if (!sid) {
            toast.error("请先选择会话");
            return;
        }

        if (this.#runsBySession.has(sid)) {
            toast.error("当前会话已有任务正在进行，请等待完成或先终止");
            return;
        }

        // 工具/技能唯一真源是 selectedTools/selectedSkills。
        // 启动本次 run 前快照一份，避免运行期间用户继续改动输入栏导致参数漂移。
        // 协议层仍只接收 id 数组，这里把完整对象映射为 id。
        const tools = this.selectedTools.map((t) => t.id);
        const skills = this.selectedSkills.map((s) => s.id);

        const seq = this.#nextSeq++;
        const runState: RunState = {
            seq,
            sessionId: sid,
            controller: new AbortController(),
            promise: null,
            deferred: createDeferred(),
            activeAssistantId: null,
            aborting: false,
        };

        this.#runsBySession.set(sid, runState);
        this.#runsBySeq.set(seq, runState);

        // 运行状态同步到 sessionStore：左侧会话条目据此展示 running 视觉
        sessionStore.setSessionRunning(sid, true);
        this.isAborting = false;
        this.setLoading(true);

        if (userMessage.content) {
            sessionStore.autoTitle(truncate(userMessage.content))
        }

        const run = this.#run(runState, userMessage, mode, tools, skills);
        runState.promise = run;
        try {
            await run;
        } finally {
            if (runState.promise === run) {
                runState.promise = null;
            }
        }
    }

    async #run(
        state: RunState,
        userMessage: ChatMessage,
        mode: string | null,
        tools: string[],
        skills: string[],
    ): Promise<void> {
        const { seq, sessionId } = state;
        const signal = state.controller.signal;
        let stream: AsyncGenerator<ChatStreamEvent> | null = null;

        try {
            Logger.debug("skills,tools:", skills, tools)
            stream = (await safeApi().project.runCommand(
                {
                    msg: userMessage.content,
                    msgId: userMessage.id,
                    files: userMessage.files ?? [],
                    tools,
                    skills,
                    timestamp: userMessage.timestamp,
                    seq,
                    mode,
                    sessId: sessionId
                },
                { signal },
            )) as AsyncGenerator<ChatStreamEvent>;

            for await (const evt of stream) {
                if (signal.aborted) break;
                if (sessionStore.activeSessionId === sessionId) {
                    this.handleStreamEvent(evt, state);
                } else {
                    this.#trackRunEvent(state, evt);
                }
            }
        } catch (err) {
            if (signal.aborted) {
                Logger.info("runCommand aborted");
            } else {
                const errText =
                    err instanceof Error ? err.message : String(err);
                if (sessionStore.activeSessionId === sessionId) {
                    const errorContent = `处理失败：${errText}`;
                    if (state.activeAssistantId && this.#findMessage(state.activeAssistantId)) {
                        this.handleStreamEvent({
                            type: "message.error",
                            messageId: state.activeAssistantId,
                            error: errorContent,
                        }, state);
                    } else {
                        state.activeAssistantId = null;
                        this.addMessage({
                            role: "assistant",
                            isError: true,
                            content: errorContent,
                        });
                    }
                } else {
                    Logger.error("runCommand failed in background session", {
                        sessionId,
                        err,
                    });
                }
            }
        } finally {
            if (stream && typeof stream.return === "function") {
                try {
                    await stream.return(undefined);
                } catch (returnErr) {
                    Logger.error(
                        "Failed to close run command stream safely:",
                        returnErr,
                    );
                }
            }

            await this.#waitForRunEnd(seq, state);

            if (sessionStore.activeSessionId === sessionId && state.activeAssistantId) {
                const m = this.#findMessage(state.activeAssistantId);
                if (m) {
                    m.streaming = false;
                    if (signal.aborted && m.content.length === 0) {
                        m.content = "您终止了当前任务,查看日志了解执行细节。";
                    }
                    this.#forceEndTraces(m);
                }
            }

            state.activeAssistantId = null;
            state.aborting = false;

            if (this.#runsBySession.get(sessionId) === state) {
                this.#runsBySession.delete(sessionId);
            }
            this.#runsBySeq.delete(seq);

            // 运行状态清除：无论前台还是后台会话，都会走到这里，
            // 左侧列表条目据此恢复为非 running 视觉
            sessionStore.setSessionRunning(sessionId, false);

            if (sessionStore.activeSessionId === sessionId) {
                this.#syncRunStateForActive();
            }
        }
    }

    async #waitForRunEnd(seq: number, state: RunState): Promise<void> {
        try {
            const suc = await pTimeout(state.deferred.promise, {
                milliseconds: RUNCOMMAND_END_TIMEOUT_MS,
            });
            Logger.debug("runcommand-end confirmed", { seq, suc });
        } catch (err) {
            if (err instanceof TimeoutError) {
                this.#runsBySeq.delete(seq);
                Logger.error(
                    "Timed out waiting for runcommand-end confirmation",
                    { seq },
                );
                const msg =
                    "终止任务超时：未能确认主进程的任务已完全结束。为安全起见,请关闭全部窗口并重启应用。";
                if (sessionStore.activeSessionId === state.sessionId) {
                    this.addMessage({
                        role: "assistant",
                        isError: true,
                        content: msg,
                    });
                    toast.error(msg);
                } else {
                    Logger.error(
                        "Timed out waiting for runcommand-end in background session",
                        { seq, sessionId: state.sessionId },
                    );
                }
            } else {
                Logger.error(
                    "Unexpected error while waiting for runcommand-end",
                    err,
                );
            }
        }
    }

    async abort(): Promise<void> {
        const sid = sessionStore.activeSessionId;
        if (!sid) return;

        const state = this.#runsBySession.get(sid);
        if (!state?.promise) return;

        state.aborting = true;
        this.isAborting = true;
        state.controller.abort();
        await state.promise;
    }
}

const KEY = Symbol.for("unigen.renderer.messageStore");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const messageStore: MessageStore = ((globalThis as any)[KEY] ??=
    new MessageStore());