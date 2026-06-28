import { api } from "$lib/utils/api";

// src/lib/stores/msg.svelte.ts
export type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
};

class MessageStore {
    messages = $state<Message[]>([
        {
            id: "1",
            role: "assistant",
            content:
                "你好！我是 AI 助手，可以帮你解答代码问题、生成代码片段、解释技术概念等。有什么我可以帮助你的吗？",
            timestamp: new Date(Date.now() - 600000),
        },
        {
            id: "2",
            role: "user",
            content: "如何在 Svelte 5 中使用 $state rune？",
            timestamp: new Date(Date.now() - 300000),
        },
        {
            id: "3",
            role: "assistant",
            content: `在 Svelte 5 中，\`$state\` rune 用于声明响应式状态。以下是基本用法：

\`\`\`typescript
let count = $state(0);
let user = $state({ name: 'Alice', age: 25 });
\`\`\`

当你修改这些变量时，所有依赖它们的地方都会自动更新：

\`\`\`svelte
<script lang="ts">
  let count = $state(0);
</script>

<button onclick={() => count++}>
  点击次数: {count}
</button>
\`\`\`

对于对象和数组，\`$state\` 会创建深度响应式代理，所以你可以直接修改嵌套属性。`,
            timestamp: new Date(Date.now() - 120000),
        },
    ]);

    isLoading = $state(false);

    // 派生状态：是否有消息
    hasMessages = $derived(this.messages.length > 0);

    // 派生状态：最后一条消息
    lastMessage = $derived(
        this.messages.length > 0
            ? this.messages[this.messages.length - 1]
            : null
    );

    addMessage(message: Omit<Message, "id" | "timestamp">) {
        const newMessage: Message = {
            ...message,
            id: Date.now().toString(),
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

    // 模拟 AI 回复
    async AIResponse(userMessage: string): Promise<void> {
        this.setLoading(true);

        try {
            const text = `resp to ${userMessage}`; // await api().system.genText(userMessage);
            this.addMessage({
                role: "assistant",
                content: text,
            });
        } finally {
            this.setLoading(false);
        }
    }
}

export const messageStore = new MessageStore();