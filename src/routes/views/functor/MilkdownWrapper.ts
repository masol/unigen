import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { nord } from '@milkdown/theme-nord';
import { history } from '@milkdown/plugin-history';
import { clipboard } from '@milkdown/plugin-clipboard';
import { cursor } from '@milkdown/plugin-cursor';
import { trailing } from '@milkdown/plugin-trailing';
import { indent } from '@milkdown/plugin-indent';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { block } from '@milkdown/plugin-block';
import { slashFactory } from '@milkdown/plugin-slash';
import type { Ctx } from '@milkdown/ctx';
// import { $prose } from '@milkdown/utils';

export interface MilkdownConfig {
    initialValue?: string;
    onChange?: (markdown: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onEvent?: (event: string, data?: Record<string, unknown>) => void;
    placeholder?: string;
}

export class MilkdownWrapper {
    private editor: Editor | null = null;
    private container: HTMLElement;
    private config: MilkdownConfig;

    constructor(container: HTMLElement, config: MilkdownConfig = {}) {
        this.container = container;
        this.config = config;
        this.init();
    }

    private async init() {
        try {
            const slash = slashFactory('my-slash');

            this.editor = await Editor.make()
                .config((ctx) => {
                    ctx.set(rootCtx, this.container);
                    ctx.set(defaultValueCtx, this.config.initialValue || '');

                    // 设置监听器
                    const listenerPlugin = ctx.get(listenerCtx);

                    listenerPlugin.markdownUpdated((_ctx, markdown) => {
                        this.config.onChange?.(markdown);
                    });

                    listenerPlugin.focus(() => {
                        this.config.onFocus?.();
                    });

                    listenerPlugin.blur(() => {
                        this.config.onBlur?.();
                    });

                    // 配置 slash 插件
                    ctx.update(slash.key, (prev) => ({
                        ...prev,
                        config: (ctx: Ctx) => {
                            void(ctx)
                            return [
                                {
                                    id: 'h1',
                                    title: 'Heading 1',
                                    description: 'Big section heading',
                                    onSelect: (ctx: Ctx) => {
                                        const view = ctx.get(editorViewCtx);
                                        const { state, dispatch } = view;
                                        const { tr } = state;
                                        
                                        dispatch(
                                            tr.setBlockType(
                                                state.selection.from,
                                                state.selection.to,
                                                state.schema.nodes.heading,
                                                { level: 1 }
                                            )
                                        );
                                    }
                                },
                                {
                                    id: 'h2',
                                    title: 'Heading 2',
                                    description: 'Medium section heading',
                                    onSelect: (ctx: Ctx) => {
                                        const view = ctx.get(editorViewCtx);
                                        const { state, dispatch } = view;
                                        const { tr } = state;
                                        
                                        dispatch(
                                            tr.setBlockType(
                                                state.selection.from,
                                                state.selection.to,
                                                state.schema.nodes.heading,
                                                { level: 2 }
                                            )
                                        );
                                    }
                                },
                                {
                                    id: 'h3',
                                    title: 'Heading 3',
                                    description: 'Small section heading',
                                    onSelect: (ctx: Ctx) => {
                                        const view = ctx.get(editorViewCtx);
                                        const { state, dispatch } = view;
                                        const { tr } = state;
                                        
                                        dispatch(
                                            tr.setBlockType(
                                                state.selection.from,
                                                state.selection.to,
                                                state.schema.nodes.heading,
                                                { level: 3 }
                                            )
                                        );
                                    }
                                },
                                {
                                    id: 'paragraph',
                                    title: 'Paragraph',
                                    description: 'Start writing with plain text',
                                    onSelect: (ctx: Ctx) => {
                                        const view = ctx.get(editorViewCtx);
                                        const { state, dispatch } = view;
                                        const { tr } = state;
                                        
                                        dispatch(
                                            tr.setBlockType(
                                                state.selection.from,
                                                state.selection.to,
                                                state.schema.nodes.paragraph
                                            )
                                        );
                                    }
                                },
                                {
                                    id: 'bulletList',
                                    title: 'Bullet List',
                                    description: 'Create a simple bulleted list',
                                    onSelect: (ctx: Ctx) => {
                                        const view = ctx.get(editorViewCtx);
                                        const { state, dispatch } = view;
                                        const { tr } = state;
                                        const { bullet_list, list_item, paragraph } = state.schema.nodes;
                                        
                                        const listItem = list_item.create(null, paragraph.create());
                                        const bulletListNode = bullet_list.create(null, listItem);
                                        
                                        dispatch(tr.replaceSelectionWith(bulletListNode));
                                    }
                                },
                                {
                                    id: 'orderedList',
                                    title: 'Numbered List',
                                    description: 'Create a numbered list',
                                    onSelect: (ctx: Ctx) => {
                                        const view = ctx.get(editorViewCtx);
                                        const { state, dispatch } = view;
                                        const { tr } = state;
                                        const { ordered_list, list_item, paragraph } = state.schema.nodes;
                                        
                                        const listItem = list_item.create(null, paragraph.create());
                                        const orderedListNode = ordered_list.create(null, listItem);
                                        
                                        dispatch(tr.replaceSelectionWith(orderedListNode));
                                    }
                                },
                                {
                                    id: 'codeBlock',
                                    title: 'Code Block',
                                    description: 'Capture a code snippet',
                                    onSelect: (ctx: Ctx) => {
                                        const view = ctx.get(editorViewCtx);
                                        const { state, dispatch } = view;
                                        const { tr } = state;
                                        
                                        dispatch(
                                            tr.setBlockType(
                                                state.selection.from,
                                                state.selection.to,
                                                state.schema.nodes.code_block
                                            )
                                        );
                                    }
                                },
                                {
                                    id: 'blockquote',
                                    title: 'Quote',
                                    description: 'Capture a quote',
                                    onSelect: (ctx: Ctx) => {
                                        const view = ctx.get(editorViewCtx);
                                        const { state, dispatch } = view;
                                        const { tr } = state;
                                        const { blockquote, paragraph } = state.schema.nodes;
                                        
                                        const para = paragraph.create();
                                        const quote = blockquote.create(null, para);
                                        
                                        dispatch(tr.replaceSelectionWith(quote));
                                    }
                                },
                                {
                                    id: 'hr',
                                    title: 'Divider',
                                    description: 'Visually divide blocks',
                                    onSelect: (ctx: Ctx) => {
                                        const view = ctx.get(editorViewCtx);
                                        const { state, dispatch } = view;
                                        const { tr } = state;
                                        const hr = state.schema.nodes.hr.create();
                                        
                                        dispatch(tr.replaceSelectionWith(hr));
                                    }
                                }
                            ];
                        }
                    }));
                })
                .config(nord)
                .use(commonmark)
                .use(gfm)
                .use(history)
                .use(clipboard)
                .use(cursor)
                .use(trailing)
                .use(indent)
                .use(listener)
                .use(block)
                .use(slash)
                .create();

            this.setupBlockDragHandles();
        } catch (error) {
            console.error('Failed to initialize Milkdown editor:', error);
            throw error;
        }
    }

    private setupBlockDragHandles() {
        this.config.onEvent?.('block-drag-enabled', {});
    }

    public getMarkdown(): string {
        if (!this.editor) return '';

        let markdown = '';
        this.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            // 使用 ProseMirror 的方式序列化文档
            // 这需要一个 serializer，我们简化为获取文本内容
            const doc = view.state.doc;
            
            // 简单的遍历节点获取 markdown
            // 实际应该使用 markdown serializer
            const textParts: string[] = [];
            doc.descendants((node) => {
                if (node.isText) {
                    textParts.push(node.text || '');
                }
                return true;
            });
            markdown = textParts.join('');
        });

        return markdown;
    }

    public setMarkdown(markdown: string): void {
        if (!this.editor) return;

        // 销毁并重新创建编辑器
        this.editor.destroy();
        this.config.initialValue = markdown;
        this.init();
    }

    public focus(): void {
        if (!this.editor) return;

        this.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            view.focus();
        });
    }

    public blur(): void {
        if (!this.editor) return;

        this.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            view.dom.blur();
        });
    }

    public async onMenucmd(cmd: string, param?: Record<string, unknown>): Promise<void> {
        void(param)
        if (!this.editor) return;

        this.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const { state, dispatch } = view;
            const { tr } = state;

            switch (cmd) {
                case 'bold': {
                    const strongMark = state.schema.marks.strong;
                    if (strongMark) {
                        dispatch(tr.addMark(state.selection.from, state.selection.to, strongMark.create()));
                    }
                    break;
                }
                case 'italic': {
                    const emMark = state.schema.marks.em;
                    if (emMark) {
                        dispatch(tr.addMark(state.selection.from, state.selection.to, emMark.create()));
                    }
                    break;
                }
                default:
                    console.warn(`Unknown command: ${cmd}`);
            }
        });
    }

    public destroy(): void {
        if (this.editor) {
            this.editor.destroy();
            this.editor = null;
        }
    }

    public getEditor(): Editor | null {
        return this.editor;
    }
}