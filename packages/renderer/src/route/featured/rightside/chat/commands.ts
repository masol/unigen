// src/lib/components/chat/commands.ts
export type ChatCommand = {
    id: string;
    /** 插入到输入框的文本前缀，例如 "/translate" */
    label: string;
    desc: string;
};

export const chatCommands: ChatCommand[] = [
    { id: "translate", label: "/translate", desc: "翻译选中或输入的内容" },
    { id: "summarize", label: "/summarize", desc: "总结当前对话或长文本" },
    { id: "explain", label: "/explain", desc: "解释术语、概念或代码" },
    { id: "polish", label: "/polish", desc: "润色 / 改写文字表达" },
    { id: "clear", label: "/clear", desc: "清空当前对话记录" },
];

/** 根据输入的查询词过滤命令（去掉开头的 "/"） */
export function filterCommands(
    query: string,
    source: ChatCommand[] = chatCommands,
): ChatCommand[] {
    const q = query.replace(/^\//, "").toLowerCase().trim();
    if (!q) return source;
    return source.filter(
        (c) =>
            c.label.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q),
    );
}