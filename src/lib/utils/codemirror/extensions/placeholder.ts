import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export function createPlaceholderExtension(isDark: boolean): Extension {
    return EditorView.theme({
        '&.cm-focused .cm-placeholder': {
            color: 'transparent'
        },
        '.cm-placeholder': {
            color: isDark ? '#64748b' : '#94a3b8',
            fontStyle: 'italic'
        }
    });
}