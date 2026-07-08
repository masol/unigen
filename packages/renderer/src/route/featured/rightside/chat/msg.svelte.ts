// src/lib/stores/msg.svelte.ts
export type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
};

/** AI 工作阶段：null 表示空闲；有值时用于界面顶部/占位区展示当前进度 */
export type ReflectPhase = {
    /** 阶段标题，如「正在反思工作流」 */
    title: string;
    /** 辅助说明，如「工作细节可通过日志查看…」 */
    detail: string;
} | null;

class MessageStore {
    messages = $state<Message[]>([
    ]);

    isLoading = $state(false);

    /** 当前 AI 工作阶段（反思中/生成中），null 表示无 */
    phase = $state<ReflectPhase>(null);

    hasMessages = $derived(this.messages.length > 0);

    lastMessage = $derived(
        this.messages.length > 0 ? this.messages[this.messages.length - 1] : null,
    );

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
     * 处理用户请求：
     * 1) 反思阶段 —— 界面提示「AI 正在反思工作流…」；
     * 2) 生成阶段 —— 提示「正在生成改进方案…」；
     * 结束后清空 phase，追加正常回复。
     */
    async AIResponse(userMessage: string): Promise<void> {
        this.setLoading(true);

        try {
            // ── 阶段一：反思 ──
            this.phase = {
                title: "AI 正在反思当前工作流",
                detail: "正在分析薄弱环节，工作细节可通过日志查看…",
            };
            await this.#delay(1200);

            // ── 阶段二：生成改进方案 ──
            this.phase = {
                title: "正在生成改进方案",
                detail: "将反思结论转化为可执行的工作流调整…",
            };
            await this.#delay(1000);

            // 实际调用：const text = await api().system.genText(userMessage);
            const text = `已根据你的要求「${userMessage}」完成一轮反思，并对工作流进行了针对性调整。你可以追问我具体的改动理由，或让我继续迭代优化。`;

            this.addMessage({ role: "assistant", content: text });
        } finally {
            // 阶段结束：移除进度提示，恢复正常内容
            this.phase = null;
            this.setLoading(false);
        }
    }

    #delay(ms: number) {
        return new Promise((r) => setTimeout(r, ms));
    }
}

export const messageStore = new MessageStore();