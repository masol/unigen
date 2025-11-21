import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export function createThemeExtension(isDark: boolean): Extension {
    return EditorView.theme(
        {
            '&': {
                height: '100%',
                fontSize: '14px',
                backgroundColor: 'transparent'
            },
            '.cm-scroller': {
                overflow: 'auto',
                fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
            },
            '.cm-content': {
                padding: '1rem',
                caretColor: isDark ? '#e2e8f0' : '#1e293b'
            },
            '.cm-line': {
                padding: '0',
                lineHeight: '1.6'
            },
            '.cm-gutters': {
                backgroundColor: 'transparent',
                borderRight: isDark ? '1px solid rgb(51 65 85)' : '1px solid rgb(226 232 240)'
            },
            '.cm-activeLineGutter': {
                backgroundColor: isDark ? 'rgba(99 102 241 / 0.15)' : 'rgba(99 102 241 / 0.1)'
            },
            '.cm-activeLine': {
                backgroundColor: isDark ? 'rgba(99 102 241 / 0.08)' : 'rgba(99 102 241 / 0.05)'
            },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
                backgroundColor: isDark
                    ? 'rgba(99 102 241 / 0.35) !important'
                    : 'rgba(99 102 241 / 0.25) !important'
            },
            '.cm-cursor': {
                borderLeftColor: isDark ? '#e2e8f0' : '#1e293b',
                borderLeftWidth: '2px'
            },
            // 折叠相关样式
            '.cm-foldGutter': {
                width: '16px',
                minWidth: '16px',
                paddingLeft: '2px'
            },
            '.cm-foldmarker-open, .cm-foldmarker-closed': {
                display: 'inline-block',
                lineHeight: '1',
                transition: 'color 0.2s, transform 0.2s'
            },
            '.cm-foldmarker-open:hover, .cm-foldmarker-closed:hover': {
                color: isDark ? '#94a3b8 !important' : '#64748b !important',
                transform: 'scale(1.2)'
            },
            '.cm-foldPlaceholder': {
                backgroundColor: isDark ? 'rgb(51 65 85)' : 'rgb(226 232 240)',
                border: isDark ? '1px solid rgb(71 85 105)' : '1px solid rgb(203 213 225)',
                color: isDark ? '#94a3b8' : '#64748b',
                borderRadius: '3px',
                padding: '0 6px',
                margin: '0 2px',
                cursor: 'pointer',
                display: 'inline-block',
                fontSize: '0.85em'
            },
            '.cm-foldPlaceholder:hover': {
                backgroundColor: isDark ? 'rgb(71 85 105)' : 'rgb(203 213 225)'
            }
        },
        { dark: isDark }
    );
}