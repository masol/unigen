import { configStore } from "$lib/store/config.svelte";

type MarkdownCapableEditor = {
    getMarkdown?: () => unknown;
    storage?: {
        markdown?: {
            getMarkdown?: () => unknown;
        };
    };
};

export function prettyPath(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export function formatDate(value?: number): string {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat(configStore.lang, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

/**
 * 读取编辑器的 Markdown 序列化结果。
 *
 * 优先使用 Edra/Tiptap Markdown 官方入口 `editor.getMarkdown()`。
 * 兼容部分版本通过 `editor.storage.markdown.getMarkdown()` 暴露的序列化方法。
 *
 * 返回 null 表示当前编辑器没有可用的 Markdown 扩展/序列化能力。
 * 不要回退到 getJSON()：PAC 文件正文是 Markdown，把 JSON 写回会破坏文件。
 */
export function readEditorMarkdown(editor: unknown): string | null {
    const typed = editor as MarkdownCapableEditor | null | undefined;
    if (!typed) return null;

    if (typeof typed.getMarkdown === "function") {
        const markdown = typed.getMarkdown();
        if (typeof markdown === "string") return markdown;
    }

    const fromStorage = typed.storage?.markdown?.getMarkdown?.();
    if (typeof fromStorage === "string") return fromStorage;

    return null;
}