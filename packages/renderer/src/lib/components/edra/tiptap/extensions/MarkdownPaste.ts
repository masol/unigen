/**
 * MarkdownPaste —— 把"粘贴进来的内容优先当作 Markdown 处理，展开为若干节点"
 *
 * 放置位置建议：tiptap/extensions/MarkdownPaste.ts
 *
 * 说明：本文件是「独立扩展」版本，不依赖 iframe 扩展。仓库中 Iframe 已被禁用，
 *      因此这里去掉了「让位给 iframe handlePaste」的闸门；若日后重新启用 Iframe，
 *      请在 handlePaste 第 (2) 步位置补回一条 <iframe>…</iframe> 让位判断即可。
 *
 * 注册方式（二选一）：
 *  A. 写进默认扩展集 extensions.ts 的 getDefaultExtensions()：
 *       import { MarkdownPaste } from './tiptap/extensions/MarkdownPaste.js';
 *       ...
 *       Markdown.configure({ markedOptions: { gfm: true } }),   // 顺手打开 gfm，表格/任务列表才能命中
 *       MarkdownPaste,
 *     并在 tiptap/extensions/index.ts 里 export { MarkdownPaste };
 *  B. 使用方注入（不动库）：
 *       Edra.createEditor({ extensions: [MarkdownPaste.configure({ mode: 'smart' })] });
 *
 * 顺序注意：ProseMirror 按插件数组顺序依次调用 handlePaste，第一个返回 true 的胜出。
 * createEditor() 的注册顺序是 getDefaultExtensions() -> props.extensions -> 内置那一批
 * （CodeBlockLowlight / MediaPlaceholder / ImageExtended / VideoExtended ...）。
 * Iframe 禁用后内置批次里已无 iframe 的 handlePaste，本扩展无需再为其让位；
 * 图片/文件粘贴仍会通过下面的 files 闸门让给 MediaPlaceholder(onUpload)。
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/* 给具名命令 insertMarkdown 补类型增强，放在本文件顶部即可（写在 Extension 里不会自动生效） */
declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        markdownPaste: {
            /** 把手里的 Markdown 字符串按 Markdown 展开为若干节点插入当前选区 */
            insertMarkdown: (content: string) => ReturnType;
        };
    }
}

export interface MarkdownPasteOptions {
    /**
     * smart （默认）：只有"剪贴板没有 text/html，或 HTML 只是纯文本外壳"时才走 Markdown；
     *               并且纯文本还要命中 Markdown 特征，才接管。
     * always ：忽略 text/html，只要有 text/plain 就一律按 Markdown 解析（Markdown 说了算）。
     * never  ：完全关闭，等价原生行为。
     */
    mode?: 'smart' | 'always' | 'never';
    /** 按住 Shift / Alt 粘贴时跳过 Markdown 解析，退回原生粘贴（应急逃生口） */
    shiftEscape?: boolean;
    /** mode = 'smart' 时，是否要求纯文本先命中 Markdown 特征 */
    requireMarkdownLike?: boolean;
}

/** 真正的富格式 HTML 才会出现的标签；都不出现，说明 HTML 只是 <p>/<div>/<br>/<span> 外壳 */
const REAL_FORMATTING_HTML =
    /<\s*(a|b|strong|i|em|u|s|del|strike|code|pre|kbd|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|img|iframe|video|audio|source|figure|hr|sup|sub|font)\b/i;

const MD_PATTERNS: RegExp[] = [
    /^ {0,3}#{1,6}\s+\S/m, // ATX 标题
    /^\s*[-*+]\s+\S/m, // 无序列表
    /^\s*\d{1,9}[.)]\s+\S/m, // 有序列表
    /```|~~~/, // 代码围栏（含仓库自定义 ```mermaid）
    /\*\*[^*\n]+\*\*|__[^_\n]+__/, // 加粗
    /(^|[\s(])\*[^*\n]+\*([\s).,;:!?]|$)/m, // 斜体
    /^\s{0,3}>\s+\S/m, // 引用
    /\[[^\]\n]+\]\([^)\n]+\)/, // 链接
    /^\s*\|.*\|\s*$/m, // 表格行
    /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|\s*$/m, // 表格分隔行
    /^- \[[ xX]\]\s+/, // 任务列表
    /^\$\w+[\s\S]*?\n\$/, // 仓库自定义 Callout：$callout ... $
    /~~[^~\n]+~~/, // 删除线
    /\$[^$\n]+\$/ // 行内公式（Mathematics）
];

function looksLikeMarkdown(text: string): boolean {
    return MD_PATTERNS.some((re) => re.test(text));
}

function htmlIsOnlyPlainTextShell(html: string): boolean {
    if (!html) return true;
    return !REAL_FORMATTING_HTML.test(html);
}

export const MarkdownPaste = Extension.create<MarkdownPasteOptions>({
    name: 'markdownPaste',

    addOptions() {
        return {
            mode: 'smart',
            shiftEscape: true,
            requireMarkdownLike: true
        };
    },

    /**
     * 具名命令：把手里的 Markdown 字符串按 Markdown 展开插入。
     * 类型见文件顶部 declare module 增强，调用：editor.commands.insertMarkdown(md)。
     */
    addCommands() {
        return {
            insertMarkdown:
                (content: string) =>
                    ({ editor }) =>
                        editor
                            .chain()
                            .focus()
                            .insertContent(content, { contentType: 'markdown' })
                            .run()
        };
    },

    addProseMirrorPlugins() {
        const { editor } = this;
        const { mode, requireMarkdownLike } = this.options;

        return [
            new Plugin({
                key: new PluginKey('markdownPaste'),
                props: {
                    handlePaste: (view, event) => {
                        if (mode === 'never') return false;
                        // Markdown 扩展没注册时不要接管（对齐 AI.svelte 里 if (editor.markdown) 的写法）
                        if (!editor.markdown) return false;

                        const dt = event.clipboardData;
                        if (!dt) return false;

                        // 1) 图片/视频/音频等文件粘贴，让给 MediaPlaceholder(onUpload)
                        if (dt.files && dt.files.length > 0) return false;

                        const text = dt.getData('text/plain') ?? '';
                        if (!text.trim()) return false;

                        // 2) 逃生口：Shift/Alt 粘贴走原生
                        // if (shiftEscape && (event.shiftKey || event.altKey)) return false;

                        // 3) 代码块里不要展开 Markdown，否则 ``` 会被就地重排
                        if (editor.isActive('codeBlock')) return false;

                        // 4) 有真正的富格式 HTML 时，HTML 优先（从网页/Word 复制的排版不该被丢掉）
                        const html = dt.getData('text/html') ?? '';
                        const markdownWins = mode === 'always' || htmlIsOnlyPlainTextShell(html);
                        if (!markdownWins) return false;

                        // 5) smart 模式下的特征判定：普通散文不接管，避免误伤
                        if (mode === 'smart' && requireMarkdownLike && !looksLikeMarkdown(text)) return false;

                        event.preventDefault();

                        // 一次插入 = 一个事务 = 一次 Ctrl+Z；不要在这里循环插入，否则撤销会碎成多步
                        editor
                            .chain()
                            .focus()
                            .insertContent(text, { contentType: 'markdown' })
                            .run();

                        return true;
                    }
                }
            })
        ];
    }
});

export default MarkdownPaste;
