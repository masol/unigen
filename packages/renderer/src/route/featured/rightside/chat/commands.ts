// src/lib/components/chat/commands.ts
export type ChatCommand = {
    id: string;
    /** 插入到输入框的文本前缀，例如 "/translate" */
    label: string;
    desc: string;
};

export const chatCommands: ChatCommand[] = [
    {
        id: "导出知识库", label: "/export", desc: `将项目知识库导出，支持如下参数:
--kc 导出到知识库项目类型目录下。
--noentry: 不导出入口设置信息。
--nores:\t 不导出资源。
--nocap:\t 不导出能力。
--nometag: 不导出元术语。
` },
    {
        id: "plan", label: "/plan", desc: `给出输入/输出(如从剧本生成视频)，规划工作流。支持如下参数：
--cap: 指定根能力，而不是当前项目类型。new或uuid,new表示新建。
--rounds: 最大轮次，默认6.
--expand-depth: 最大展开的层级，默认6.
--llm-pc: 当Rag未给出人类流程时，由LLM生成后，是否校验（procedure check）。默认off，通过设置为on打开。
` },
    {
        id: "prism", label: "/prism", desc: `使用prism方法回答你的问题--无上下文，支持如下参数：
--facets: 最大视角数，默认5.
--rounds: 最大轮次，默认2.
--kind:   日志中的名称。
` },
    {
        id: "preprism", label: "/preprism", desc: `使用preprism方法回答你的问题--无上下文，支持如下参数：
--facets: 最大维度数，默认5.
--kind:   日志中的名称。`},
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