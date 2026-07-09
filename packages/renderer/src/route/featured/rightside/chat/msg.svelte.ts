// src/lib/stores/msg.svelte.ts
import { safeApi } from "$lib/utils/api";
import { toast } from "svelte-sonner"; // 按你的项目实际 toast 库调整

export type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
};

export type ReflectPhase = {
    title: string;
    detail: string;
} | null;

// 流式事件：阶段更新 or 最终文本（真实场景可再加 token 增量等）
type StreamEvent =
    | { type: "phase"; phase: NonNullable<ReflectPhase> }
    | { type: "text"; text: string };

class MessageStore {
    messages = $state<Message[]>([]);
    isLoading = $state(false);

    /** 当前 AI 工作阶段（反思中/生成中），null 表示无 */
    phase = $state<ReflectPhase>(null);

    /** 是否处于「终止中」——已发出 abort 信号但流尚未结束 */
    isAborting = $state(false);

    hasMessages = $derived(this.messages.length > 0);
    lastMessage = $derived(
        this.messages.length > 0 ? this.messages[this.messages.length - 1] : null,
    );

    #controller: AbortController | null = null;
    /** 当前运行中的流消费 promise；null 表示空闲 */
    #runPromise: Promise<void> | null = null;

    addMessage(message: Omit<Message, "id" | "timestamp">) {
        const newMessage: Message = {
            ...message,
            id: crypto?.randomUUID?.() ?? Date.now().toString(),
            timestamp: new Date(),
        };
        this.messages = [...this.messages, newMessage];
        return newMessage;
    }

    clear() {
        this.messages = [];
    }

    deleteMessage(id: string) {
        this.messages = this.messages.filter((msg) => msg.id !== id);
    }

    setLoading(loading: boolean) {
        this.isLoading = loading;
    }

    /**
     * 流式消费入口：若已有任务在运行则报错退出；否则启动一轮消费。
     * 期间可调用 abort() 提前终止。
     */
    AIResponse(userMessage: string): Promise<void> {
        // 已有任务在跑 —— 直接报错退出，不打断当前任务
        if (this.#runPromise) {
            toast.error("已有任务正在进行，请等待完成或先终止当前任务");
            return Promise.resolve();
        }

        this.#controller = new AbortController();
        const { signal } = this.#controller;

        this.isAborting = false;
        this.setLoading(true);

        const run = this.#run(userMessage, signal);
        this.#runPromise = run;
        return run;
    }

    /** 内部：真正的流消费主循环 */
    async #run(userMessage: string, signal: AbortSignal): Promise<void> {
        try {
            let finalText = "";

            // 真实实现替换为：
            // const stream = api().system.genTextStream(userMessage, { signal });
            const stream: AsyncGenerator<StreamEvent> = await safeApi().project.runCommand(userMessage, { signal });

            for await (const evt of stream) {
                if (signal.aborted) break;
                if (evt.type === "phase") this.phase = evt.phase;
                else finalText = evt.text;
            }

            if (signal.aborted) {
                this.addMessage({ role: "assistant", content: "您终止了当前任务，查看日志了解执行细节。" });
            }

            // 只有未被中断且拿到文本才落地
            if (!signal.aborted && finalText) {
                this.addMessage({ role: "assistant", content: finalText });
            }
        } catch (err) {
            // abort 引发的异常静默吞掉，其余才提示
            if (!signal.aborted) {
                this.addMessage({
                    role: "assistant",
                    content: `处理失败：${err instanceof Error ? err.message : String(err)}`,
                });
            }
        } finally {
            this.phase = null;
            this.isAborting = false;
            this.setLoading(false);
            this.#controller = null;
            this.#runPromise = null;
        }
    }

    /**
     * 请求终止：发信号 + 切「终止中」状态，
     * 然后等待 #mockStream 真正收尾结束后才 resolve（状态已在 #run.finally 归位）。
     */
    async abort(): Promise<void> {
        if (!this.#controller || !this.#runPromise) return;
        this.isAborting = true;
        this.#controller.abort();
        // 等待流（含 generator 的 finally 收尾）彻底结束
        await this.#runPromise;
    }

    /**
     * 模拟流式后端：分阶段 yield phase，最后 yield 文本。
     * finally 段模拟「收到终止信号后的后端清理」——for await 在 break 时
     * 会调用本 generator 的 .return() 并 await 此 finally，从而保证
     * 状态变更发生在流真正结束之后。
     */
    // async *#mockStream(
    //     userMessage: string,
    //     signal: AbortSignal,
    // ): AsyncGenerator<StreamEvent> {
    //     try {
    //         yield {
    //             type: "phase",
    //             phase: {
    //                 title: "AI 正在反思当前工作流",
    //                 detail: "正在分析薄弱环节，工作细节可通过日志查看…",
    //             },
    //         };
    //         await this.#delay(1800000, signal);

    //         yield {
    //             type: "phase",
    //             phase: {
    //                 title: "正在生成改进方案",
    //                 detail: "将反思结论转化为可执行的工作流调整…",
    //             },
    //         };
    //         await this.#delay(3000, signal);

    //         await this.#delay(15000);

    //         yield {
    //             type: "text",
    //             text: `已根据你的要求「${userMessage}」完成一轮反思，并对工作流进行了针对性调整。你可以追问我具体的改动理由，或让我继续迭代优化。`,
    //         };
    //     } finally {
    //         // 被中断时的收尾（模拟后端确认终止）；此处的 await 会被
    //         // for await 的 .return() 等待，因此状态不会提前变化。
    //         if (signal.aborted) {
    //             this.phase = {
    //                 title: "正在终止…",
    //                 detail: "等待后端确认终止并清理…",
    //             };
    //             await this.#delay(400); // 收尾不再可被中断
    //         }
    //     }
    // }

    // /** 可被 abort 提前唤醒的 delay（不再傻等） */
    // #delay(ms: number, signal?: AbortSignal) {
    //     return new Promise<void>((resolve) => {
    //         if (signal?.aborted) return resolve();
    //         const t = setTimeout(resolve, ms);
    //         signal?.addEventListener(
    //             "abort",
    //             () => {
    //                 clearTimeout(t);
    //                 resolve();
    //             },
    //             { once: true },
    //         );
    //     });
    // }
}

export const messageStore = new MessageStore();