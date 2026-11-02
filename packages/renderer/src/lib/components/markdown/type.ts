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