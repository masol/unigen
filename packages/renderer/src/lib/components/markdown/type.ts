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
 * 由 Message.svelte 注入，供 ext/CodeBlock 等 ext 渲染器读取"当前是否仍在流式输出"，
 * 以便在未完成态禁用复制等功能。
 * 使用 Svelte Context 而非 props 的原因：
 *   1. @humanspeak/svelte-markdown 是否将 `streaming` 透传给 code renderer 不稳定；
 *   2. CodeBlock 可能在任意 markdown 上下文中被复用，需要一种与渲染管线无关的注入方式。
 */
export const MARKDOWN_STREAMING_KEY = Symbol("markdown-streaming");

export type MarkdownStreamingState = {
    /** 当前 markdown 是否处于流式输出（生产方每次变更后写入） */
    streaming: boolean;
};