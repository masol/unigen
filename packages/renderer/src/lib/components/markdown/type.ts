// markdown 层的最小类型契约
// 原则：此文件不得依赖 markdown 以外的任何业务模块
import type { Renderers } from "@humanspeak/svelte-markdown";

export type MarkdownRenderers = Partial<Renderers>;

/**
 * markdown 渲染组件接受的最小消息形状。
 * 任何领域对象（ChatMessage 等）只要结构兼容即可直接传入。
 */
export type MarkdownMessage = {
    content: string;
    /** 是否以错误风格渲染（红色前景、告警边框等） */
    isError?: boolean;
};

/**
 * 流式状态上下文键。
 * 由 Message.svelte 注入，供 ext/CodeBlock 等 ext 渲染器读取当前流式状态。
 *
 * 使用 Svelte Context 而非 props 的原因：
 *   1. @humanspeak/svelte-markdown 是否将 `streaming` 透传给 code renderer 不稳定；
 *   2. CodeBlock 可能在任意 markdown 上下文中被复用，需要一种与渲染管线无关的注入方式。
 */
export const MARKDOWN_STREAMING_KEY = Symbol("markdown-streaming");

/**
 * 流式状态上下文值。
 *
 * 注意：这里只暴露 **文档级** 流式状态，语义是"上界"，不是可以单独
 * 作为"某块已完成"判断依据的布尔值。真正判定"某个 code block 是否
 * 可以复制"，还需要下游结合该块的围栏闭合情况自行推导：
 *
 *    本块仍在流 = documentStreaming && 本块围栏未闭合
 *    本块已完成 = !documentStreaming || 本块围栏已闭合
 *
 * 之所以不做成两个字段（documentStreaming + blockClosed）：
 *   - "本块是否闭合"不是文档级信息，放在 context 里语义会被错配到所有块；
 *   - 库本身没有为内置 code token 提供 `closed`，需要下游从 token 的 `raw`
 *     做推断，本层不应预设结论。
 */
export type MarkdownStreamingState = {
    /**
     * 整条 markdown 消息是否仍在流式输出（生产方每次变更后写入）。
     * CodeBlock 会以此作为"上界"：只有它 true 时才可能还在流式；
     * 一旦下游能证明"本块围栏已闭合"，即使它为 true 也应视为可复制。
     */
    documentStreaming: boolean;
};