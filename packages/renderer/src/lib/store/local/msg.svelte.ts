// src/lib/store/local/msg.svelte.ts
import { projectStore } from "$lib/store/project.svelte";
import { safeApi } from "$lib/utils/api";
import evtbus from "$lib/utils/evtbus";
import Logger from "electron-log/renderer.js";
import pTimeout, { TimeoutError } from "p-timeout";
import { toast } from "svelte-sonner";

import type {
    AgentIdentity,
    ChatMessage,
    ChatStreamEvent,
    TraceAgentNode,
    TraceNode,
} from "./chat.types";

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
    }

    // ── Public reactive state ───────────────────────────────────
    messages = $state<ChatMessage[]>([]);
    isLoading = $state(false);
    isAborting = $state(false);
    sessionId = $state<string | undefined>(undefined);
    collapsedMessages = $state<Record<string, boolean>>({});

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
    /** 当前消息的根 agent 节点 id（用于自动挂载） */
    #rootAgentId: string | null = null;

    // ── Message CRUD ────────────────────────────────────────────
    addMessage(partial: Omit<ChatMessage, "id" | "timestamp">): ChatMessage {
        const msg: ChatMessage = {
            ...partial,
            id: newId(),
            timestamp: Date.now(),
        };
        this.messages = [...this.messages, msg];
        return msg;
    }

    clear() {
        this.messages = [];
        this.collapsedMessages = {};
        this.#activeAssistantId = null;
        this.#rootAgentId = null;
        this.sessionId = undefined;
    }

    deleteMessage(id: string) {
        this.messages = this.messages.filter((m) => m.id !== id);
        delete this.collapsedMessages[id];
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
                if (node.kind === "agent" && node.children.length > 0) {
                    const found = search(node.children);
                    if (found) return found;
                }
            }
            return null;
        };

        return search(msg.traces);
    }

    /**
     * 获取当前消息的根 agent 节点（如果存在）
     */
    #getRootAgent(): TraceAgentNode | null {
        if (!this.#activeAssistantId || !this.#rootAgentId) return null;
        const node = this.#findTraceNode(this.#activeAssistantId, this.#rootAgentId);
        if (!node || node.kind !== "agent") return null;
        return node as TraceAgentNode;
    }

    // ── Stream event handling ───────────────────────────────────
    handleStreamEvent(event: ChatStreamEvent): void {
        switch (event.type) {
            case "message.start": {
                const msg: ChatMessage = {
                    id: event.messageId,
                    role: "assistant",
                    content: "",
                    timestamp: event.timestamp,
                    streaming: true,
                    agent: event.agent,
                    traces: [],
                };
                this.messages = [...this.messages, msg];
                this.#activeAssistantId = event.messageId;

                // 自动创建根 agent 节点
                this.#createRootAgent(msg, event.agent);
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
                    this.#rootAgentId = null;
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
                    this.#rootAgentId = null;
                }
                break;
            }
            case "trace.start": {
                const m = this.#findMessage(event.messageId);
                if (!m) break;

                if (event.parentId) {
                    const parent = this.#findTraceNode(event.messageId, event.parentId);
                    if (parent && parent.kind === "agent") {
                        (parent as TraceAgentNode).children.push(event.node);
                    } else {
                        Logger.warn(
                            "trace.start: parentId not found, mounting to root agent",
                            { parentId: event.parentId, nodeId: event.node.id },
                        );
                        const rootAgent = this.#getRootAgent();
                        if (rootAgent) {
                            rootAgent.children.push(event.node);
                        } else {
                            (m.traces ??= []).push(event.node);
                        }
                    }
                } else {
                    const rootAgent = this.#getRootAgent();
                    if (rootAgent) {
                        rootAgent.children.push(event.node);
                    } else {
                        (m.traces ??= []).push(event.node);
                    }
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
                node.streaming = false;
                if (event.detail != null) node.detail = event.detail;
                break;
            }
        }
    }

    #findMessage(id: string): ChatMessage | undefined {
        return this.messages.find((m) => m.id === id);
    }

    #createRootAgent(message: ChatMessage, agent: AgentIdentity): void {
        const rootId = `agent|${agent.name ?? "unknown"}`;
        this.#rootAgentId = rootId;

        const rootAgent: TraceAgentNode = {
            id: rootId,
            kind: "agent",
            status: "running",
            title: `执行 ${agent.name}`,
            agent: agent,
            children: [],
            startedAt: message.timestamp,
            streaming: true,
        };

        message.traces = [rootAgent];
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
            if (node.kind === "agent" && node.children.length > 0) {
                node.children.forEach(endNode);
            }
        };

        message.traces.forEach(endNode);
    }

    // ── Run lifecycle ───────────────────────────────────────────
    async AIResponse(userMessage: string): Promise<void> {
        if (this.#runPromise) {
            toast.error("已有对话任务正在进行，请等待完成或先终止");
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

        const run = this.#run(userMessage, signal);
        this.#runPromise = run;
        try {
            await run;
        } finally {
            this.#runPromise = null;
        }
    }

    async #run(userMessage: string, signal: AbortSignal): Promise<void> {
        let stream: AsyncGenerator<ChatStreamEvent> | null = null;
        const seq = this.#nextSeq++;
        const deferred = createDeferred();
        this.#pendingSeqs.set(seq, deferred);

        try {
            stream = (await safeApi().project.runCommand(
                { msg: userMessage, seq, sessId: this.sessionId ?? "default" },
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
                        m.content = "您终止了当前任务，查看日志了解执行细节。";
                    }
                    this.#forceEndTraces(m);
                }
                this.#activeAssistantId = null;
                this.#rootAgentId = null;
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
                    "终止任务超时：未能确认主进程的任务已完全结束。为安全起见，请关闭全部窗口并重启应用。";
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