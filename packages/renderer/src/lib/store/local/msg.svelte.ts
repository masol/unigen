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
            const pending = this.#pendingSeqs.get(seq);
            if (pending) {
                this.#pendingSeqs.delete(seq);
                pending.resolve(suc);
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
        })
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
    #controller: AbortController | null = null;
    #runPromise: Promise<void> | null = null;
    #nextSeq = 1;
    #pendingSeqs = new Map<number, SeqDeferred>();

    /** 当前正在流式接收的助手消息 id */
    #activeAssistantId: string | null = null;

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

    private async reload(): Promise<void> {
        this.messages = [];
        log.debug('[MessageStore] reload() called')
        this.isReloading = true

        try {
            this.messages = await safeApi().project.listMessage({
                sessionId: sessionStore.activeSessionId,
                withTraces: true
            })
            log.info(`[MessageStore] reload completed, loaded ${this.messages.length} messages`)
        } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            toast.error(errMessage);
            log.error('[MessageStore] reload() failed', err)
        } finally {
            this.isReloading = false
        }
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
            this.#activeAssistantId = null;
            return;
        }

        this.isDeleting = true;
        try {
            await safeApi().project.deleteMessagesAfter({ sid, fromTs: 0 });
            this.messages = [];
            this.collapsedMessages = {};
            this.#activeAssistantId = null;
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

            if (this.#activeAssistantId && ids.includes(this.#activeAssistantId)) {
                this.#activeAssistantId = null;
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
            if (this.#activeAssistantId && !this.#findMessage(this.#activeAssistantId)) {
                this.#activeAssistantId = null;
            }
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
        if (!msg?.traces) return null;

        const search = (nodes: TraceNode[]): TraceNode | null => {
            for (const node of nodes) {
                if (node.id === nodeId) return node;
                if (hasTraceChildren(node)) {
                    const found = search(node.children);
                    if (found) return found;
                }
            }
            return null;
        };

        return search(msg.traces);
    }

    // ── Stream event handling ───────────────────────────────────
    handleStreamEvent(event: ChatStreamEvent): void {
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
                this.#activeAssistantId = event.messageId;
                break;
            }
            case "message.delta": {
                const m = this.#findMessage(event.messageId);
                if (m) m.content += event.delta;
                break;
            }
            case "message.end": {
                const m = this.#findMessage(event.messageId);
                if (!m) break;
                m.streaming = false;
                if (event.content != null) {
                    m.content = event.content;
                }
                this.#forceEndTraces(m);
                if (this.#activeAssistantId === event.messageId) {
                    this.#activeAssistantId = null;
                }
                break;
            }
            case "message.error": {
                const m = this.#findMessage(event.messageId);
                if (!m) break;
                m.streaming = false;
                m.isError = true;
                m.content = event.error;
                this.#forceEndTraces(m);
                if (this.#activeAssistantId === event.messageId) {
                    this.#activeAssistantId = null;
                }
                break;
            }
            case "trace.start": {
                const m = this.#findMessage(event.messageId);
                if (!m) break;

                if (event.parentId) {
                    const parent = this.#findTraceNode(event.messageId, event.parentId);
                    if (parent && isTraceAgentNode(parent)) {
                        parent.children.push(event.node);
                    } else {
                        Logger.warn(
                            "trace.start: parentId not found or not an agent node, mounting to root",
                            { parentId: event.parentId, nodeId: event.node.id },
                        );
                        (m.traces ??= []).push(event.node);
                    }
                } else {
                    (m.traces ??= []).push(event.node);
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
        if (!message.traces || message.traces.length === 0) return;

        const endNode = (node: TraceNode) => {
            if (node.status === "running" || node.status === "pending") {
                node.status = "success";
                node.streaming = false;
                if (!node.finishedAt) {
                    node.finishedAt = Date.now();
                }
            }
            if (hasTraceChildren(node)) {
                node.children.forEach(endNode);
            }
        };

        message.traces.forEach(endNode);
    }

    // ── Run lifecycle ───────────────────────────────────────────
    async AIResponse(userMessage: ChatMessage, mode: string | null = null): Promise<void> {
        if (this.isDeleting) {
            toast.error("正在删除消息，请稍后");
            return;
        }
        if (this.#runPromise) {
            toast.error("已有任务正在进行，请等待完成或先终止");
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

        // 工具/技能唯一真源是 selectedTools/selectedSkills。
        // 启动本次 run 前快照一份，避免运行期间用户继续改动输入栏导致参数漂移。
        // 协议层仍只接收 id 数组，这里把完整对象映射为 id。
        const tools = this.selectedTools.map((t) => t.id);
        const skills = this.selectedSkills.map((s) => s.id);

        this.#controller = new AbortController();
        const { signal } = this.#controller;
        this.isAborting = false;
        this.setLoading(true);
        if (userMessage.content) {
            sessionStore.autoTitle(truncate(userMessage.content))
        }
        const run = this.#run(userMessage, signal, mode, tools, skills);
        this.#runPromise = run;
        try {
            await run;
        } finally {
            this.#runPromise = null;
        }
    }

    async #run(
        userMessage: ChatMessage,
        signal: AbortSignal,
        mode: string | null,
        tools: string[],
        skills: string[],
    ): Promise<void> {
        let stream: AsyncGenerator<ChatStreamEvent> | null = null;
        const seq = this.#nextSeq++;
        const deferred = createDeferred();
        this.#pendingSeqs.set(seq, deferred);

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
                    sessId: sessionStore.activeSessionId
                },
                { signal },
            )) as AsyncGenerator<ChatStreamEvent>;

            for await (const evt of stream) {
                if (signal.aborted) break;
                this.handleStreamEvent(evt);
            }
        } catch (err) {
            if (signal.aborted) {
                Logger.info("runCommand aborted");
            } else {
                const errText =
                    err instanceof Error ? err.message : String(err);
                if (this.#activeAssistantId) {
                    this.handleStreamEvent({
                        type: "message.error",
                        messageId: this.#activeAssistantId,
                        error: `处理失败：${errText}`,
                    });
                } else {
                    this.addMessage({
                        role: "assistant",
                        isError: true,
                        content: `处理失败：${errText}`,
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

            await this.#waitForRunEnd(seq, deferred);

            if (this.#activeAssistantId) {
                const m = this.#findMessage(this.#activeAssistantId);
                if (m) {
                    m.streaming = false;
                    if (signal.aborted && m.content.length === 0) {
                        m.content = "您终止了当前任务,查看日志了解执行细节。";
                    }
                    this.#forceEndTraces(m);
                }
                this.#activeAssistantId = null;
            }

            this.isAborting = false;
            this.setLoading(false);
            this.#controller = null;
        }
    }

    async #waitForRunEnd(seq: number, deferred: SeqDeferred): Promise<void> {
        try {
            const suc = await pTimeout(deferred.promise, {
                milliseconds: RUNCOMMAND_END_TIMEOUT_MS,
            });
            Logger.debug("runcommand-end confirmed", { seq, suc });
        } catch (err) {
            if (err instanceof TimeoutError) {
                this.#pendingSeqs.delete(seq);
                Logger.error(
                    "Timed out waiting for runcommand-end confirmation",
                    { seq },
                );
                const msg =
                    "终止任务超时：未能确认主进程的任务已完全结束。为安全起见,请关闭全部窗口并重启应用。";
                this.addMessage({
                    role: "assistant",
                    isError: true,
                    content: msg,
                });
                toast.error(msg);
            } else {
                Logger.error(
                    "Unexpected error while waiting for runcommand-end",
                    err,
                );
            }
        }
    }

    async abort(): Promise<void> {
        if (!this.#controller || !this.#runPromise) return;
        this.isAborting = true;
        this.#controller.abort();
        await this.#runPromise;
    }
}

const KEY = Symbol.for("unigen.renderer.messageStore");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const messageStore: MessageStore = ((globalThis as any)[KEY] ??=
    new MessageStore());