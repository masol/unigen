// src/lib/store/local/msg.svelte.ts
import { projectStore } from "$lib/store/project.svelte";
import { safeApi } from "$lib/utils/api";
import evtbus from "$lib/utils/evtbus";
import { hooks } from "$lib/utils/hook";
import { truncate } from '$lib/utils/str';
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

const RUNCOMMAND_END_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 1 day

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

    collapsedMessages = $state<Record<string, boolean>>({});

    /**
     * 全局思考信息（trace）显示开关。
     * 由 WorkbenchHeader 统一控制全部消息的 trace 显隐，
     * AssistantMessage 通过读取该字段决定是否渲染 AgentTrace。
     */
    tracesVisible = $state(true);

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

    clear() {
        this.messages = [];
        this.collapsedMessages = {};
        this.#activeAssistantId = null;
    }

    deleteMessage(id: string) {
        this.messages = this.messages.filter((m) => m.id !== id);
        delete this.collapsedMessages[id];
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

    /**
     * 正式声明「从此分叉」能力。
     * 当前尚未实现，先以 toast 提示占位。
     */
    async forkFrom(messageId: string): Promise<void> {
        void messageId;
        toast.warning("从此分叉功能尚未实现");
    }

    /**
     * 正式声明「从此重新发送」能力。
     * 当前尚未实现，先以 toast 提示占位。
     */
    async resendFrom(messageId: string): Promise<void> {
        void messageId;
        toast.warning("重新发送功能尚未实现");
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

        this.#controller = new AbortController();
        const { signal } = this.#controller;
        this.isAborting = false;
        this.setLoading(true);
        if (userMessage.content) {
            sessionStore.autoTitle(truncate(userMessage.content))
        }
        const run = this.#run(userMessage, signal, mode);
        this.#runPromise = run;
        try {
            await run;
        } finally {
            this.#runPromise = null;
        }
    }

    async #run(userMessage: ChatMessage, signal: AbortSignal, mode: string | null): Promise<void> {
        let stream: AsyncGenerator<ChatStreamEvent> | null = null;
        const seq = this.#nextSeq++;
        const deferred = createDeferred();
        this.#pendingSeqs.set(seq, deferred);

        try {
            stream = (await safeApi().project.runCommand(
                {
                    msg: userMessage.content,
                    msgId: userMessage.id,
                    files: userMessage.files ?? [],
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