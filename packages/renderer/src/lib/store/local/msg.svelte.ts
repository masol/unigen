// src/lib/store/local/msg.svelte.ts
import { projectStore } from "$lib/store/project.svelte";
import { safeApi } from "$lib/utils/api";
import evtbus from "$lib/utils/evtbus";
import Logger from "electron-log/renderer.js";
import pTimeout, { TimeoutError } from "p-timeout";
import { toast } from "svelte-sonner";

import type {
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
    /** 当前会话 ID（由主进程 message.start 事件设置或外部赋值） */
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

    /** trace 节点索引：按 id 直取，用于深层嵌套的快速定位 */
    #traceIndex = new Map<string, TraceNode>();
    /** 当前正在流式接收的助手消息 id（用于 fallback 错误归属） */
    #activeAssistantId: string | null = null;

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
        this.#traceIndex.clear();
        this.#activeAssistantId = null;
        // 清对话 = 开新会话；如需保留 session，去掉下一行
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

    // ── Stream event handling ───────────────────────────────────
    /**
     * 处理一个流式事件，mutate 消息/trace 状态。
     * 可被 AIResponse 的 async iterator 调用，也可被独立的 evtbus 订阅调用。
     */
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
                // 兜底规范化：只有主进程发了显式 content 才覆盖
                if (event.content != null) {
                    m.content = event.content;
                }
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
                if (this.#activeAssistantId === event.messageId) {
                    this.#activeAssistantId = null;
                }
                break;
            }
            case "trace.start": {
                const m = this.#findMessage(event.messageId);
                if (!m) break;
                this.#traceIndex.set(event.node.id, event.node);
                if (event.parentId) {
                    const parent = this.#traceIndex.get(event.parentId);
                    if (parent && parent.kind === "agent") {
                        (parent as TraceAgentNode).children.push(event.node);
                    } else {
                        Logger.warn(
                            "trace.start: parent missing or not agent, falling back to root",
                            event,
                        );
                        (m.traces ??= []).push(event.node);
                    }
                } else {
                    (m.traces ??= []).push(event.node);
                }
                break;
            }
            case "trace.update": {
                const n = this.#traceIndex.get(event.nodeId);
                if (n) Object.assign(n, event.patch);
                break;
            }
            case "trace.detail.delta": {
                const n = this.#traceIndex.get(event.nodeId);
                if (!n) break;
                n.detail = (n.detail ?? "") + event.delta;
                n.streaming = true;
                break;
            }
            case "trace.end": {
                const n = this.#traceIndex.get(event.nodeId);
                if (!n) break;
                n.streaming = false;
                if (event.detail != null) n.detail = event.detail;
                break;
            }
        }
    }

    #findMessage(id: string): ChatMessage | undefined {
        return this.messages.find((m) => m.id === id);
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
                { msg: userMessage, seq, sessId: "123123" },
                { signal },
            )) as AsyncGenerator<ChatStreamEvent>;

            for await (const evt of stream) {
                console.log("evt=", evt)
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

            // 兜底：abort 后主进程未发 message.end
            if (this.#activeAssistantId) {
                const m = this.#findMessage(this.#activeAssistantId);
                if (m) {
                    m.streaming = false;
                    if (signal.aborted && m.content.length === 0) {
                        m.content = "您终止了当前任务，查看日志了解执行细节。";
                    }
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