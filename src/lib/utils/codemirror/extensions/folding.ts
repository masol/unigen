import {
    foldGutter,
    foldKeymap,
    foldEffect,
    unfoldEffect,
    foldedRanges
} from '@codemirror/language';
import { StateEffect } from '@codemirror/state';
import type { Extension, Text } from '@codemirror/state';
import { keymap } from '@codemirror/view';

// 自定义折叠范围查找器
function findFoldRanges(doc: Text, pos: number): { from: number; to: number } | null {
    // const line = doc.lineAt(pos);
    const text = doc.toString();

    // 查找当前位置的 HTML 标签
    const beforePos = text.substring(0, pos);
    const afterPos = text.substring(pos);

    // 匹配开标签
    const openTagMatch = beforePos.match(/<(\w+)(?:\s+[^>]*)?\s*>(?!.*<\1)/);
    if (openTagMatch) {
        const tagName = openTagMatch[1];
        const openTagEnd = beforePos.length;

        // 查找对应的闭标签
        const closeTagRegex = new RegExp(`</${tagName}\\s*>`);
        const closeMatch = afterPos.match(closeTagRegex);

        if (closeMatch && closeMatch.index !== undefined) {
            const closeTagStart = pos + closeMatch.index;
            if (closeTagStart > openTagEnd) {
                return { from: openTagEnd, to: closeTagStart };
            }
        }
    }

    return null;
}

export function createFoldingExtension(isDark: boolean): Extension {
    return [
        foldGutter({
            markerDOM: (open) => {
                const marker = document.createElement('div');
                marker.textContent = open ? '▼' : '▶';
                marker.className = open ? 'cm-foldmarker-open' : 'cm-foldmarker-closed';
                marker.style.cursor = 'pointer';
                marker.style.padding = '0 2px';
                marker.style.userSelect = 'none';
                marker.style.color = isDark ? '#64748b' : '#94a3b8';
                marker.style.fontSize = '10px';
                marker.title = open ? '折叠' : '展开';
                return marker;
            },
            // 自定义折叠范围检测
            foldingChanged: (update) => {
                return update.docChanged || update.viewportChanged;
            }
        }),

        keymap.of([
            ...foldKeymap,
            {
                key: 'Ctrl-Shift-[',
                mac: 'Cmd-Alt-[',
                run: (view) => {
                    const effects: StateEffect<unknown>[] = [];
                    const { state } = view;

                    for (let pos = 0; pos < state.doc.length;) {
                        const line = state.doc.lineAt(pos);
                        const range = findFoldRanges(state.doc, line.from);
                        if (range) {
                            effects.push(foldEffect.of(range));
                        }
                        pos = line.to + 1;
                    }

                    if (effects.length > 0) {
                        view.dispatch({ effects });
                        return true;
                    }
                    return false;
                }
            },
            {
                key: 'Ctrl-Shift-]',
                mac: 'Cmd-Alt-]',
                run: (view) => {
                    const effects: StateEffect<unknown>[] = [];
                    const folded = foldedRanges(view.state);

                    folded.between(0, view.state.doc.length, (from, to) => {
                        effects.push(unfoldEffect.of({ from, to }));
                    });

                    if (effects.length > 0) {
                        view.dispatch({ effects });
                        return true;
                    }
                    return false;
                }
            }
        ])
    ];
}