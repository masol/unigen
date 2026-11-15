type MarkdownCapableEditor = {
    storage?: {
        markdown?: {
            getMarkdown?: () => unknown;
        };
    };
    getMarkdown?: () => unknown;
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

    return new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

/**
 * 读取编辑器的 Markdown 序列化结果。
 *
 * 返回 null 表示当前编辑器没有可用的 Markdown 扩展/序列化能力。
 * 不要回退到 getJSON()：PAC 文件正文是 Markdown，把 JSON 写回会破坏文件。
 */
export function readEditorMarkdown(editor: unknown): string | null {
    const typed = editor as MarkdownCapableEditor | null | undefined;
    if (!typed) return null;

    const fromStorage = typed.storage?.markdown?.getMarkdown?.();
    if (typeof fromStorage === "string") return fromStorage;

    if (typeof typed.getMarkdown === "function") {
        const fromMethod = typed.getMarkdown();
        if (typeof fromMethod === "string") return fromMethod;
    }

    return null;
}