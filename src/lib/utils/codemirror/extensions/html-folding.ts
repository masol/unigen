import { syntaxTree } from '@codemirror/language';
import { EditorView, ViewPlugin, ViewUpdate, Decoration, type DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

interface HTMLTag {
    name: string;
    from: number;
    to: number;
    isClosing: boolean;
}

function findHTMLTags(text: string): HTMLTag[] {
    const tags: HTMLTag[] = [];
    // 匹配 HTML 标签：<tagname> 或 </tagname>
    const tagRegex = /<\/?(\w+)(?:\s+[^>]*)?\s*>/g;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
        const isClosing = match[0].startsWith('</');
        const isSelfClosing = match[0].endsWith('/>');

        tags.push({
            name: match[1],
            from: match.index,
            to: match.index + match[0].length,
            isClosing: isClosing || isSelfClosing
        });
    }

    return tags;
}

function matchHTMLTags(tags: HTMLTag[], fullText: string): Array<{ from: number; to: number }> {
    const pairs: Array<{ from: number; to: number }> = [];
    const stack: HTMLTag[] = [];

    for (const tag of tags) {
        if (tag.isClosing) {
            // 检查是否是自闭合标签
            const tagText = fullText.substring(tag.from, tag.to);
            if (tagText.trim().endsWith('/>')) {
                continue;
            }

            // 找到匹配的开标签
            for (let i = stack.length - 1; i >= 0; i--) {
                if (stack[i].name === tag.name) {
                    const openTag = stack[i];
                    pairs.push({
                        from: openTag.to,
                        to: tag.from
                    });
                    stack.splice(i, 1);
                    break;
                }
            }
        } else {
            stack.push(tag);
        }
    }

    return pairs;
}

export function createHTMLFoldingExtension(): Extension {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = this.computeDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = this.computeDecorations(update.view);
                }
            }

            computeDecorations(view: EditorView): DecorationSet {
                const builder = new RangeSetBuilder<Decoration>();
                const docText = view.state.doc.toString();
                const tree = syntaxTree(view.state);

                tree.iterate({
                    enter(node) {
                        // 只在 HTML 块中处理
                        if (node.name === 'HTMLBlock') {
                            const blockText = docText.substring(node.from, node.to);
                            const tags = findHTMLTags(blockText);
                            const pairs = matchHTMLTags(tags, blockText);

                            // 为每个匹配的标签对添加折叠区域标记
                            for (const pair of pairs) {
                                const from = node.from + pair.from;
                                const to = node.from + pair.to;

                                // 确保范围有效且有内容
                                if (to > from && to - from > 1) {
                                    builder.add(
                                        from,
                                        to,
                                        Decoration.mark({
                                            class: 'cm-html-foldable',
                                            inclusive: true
                                        })
                                    );
                                }
                            }
                        }
                    }
                });

                return builder.finish();
            }
        },
        {
            decorations: (v) => v.decorations
        }
    );
}