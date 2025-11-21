import { EditorView, keymap } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentWithTab } from '@codemirror/commands';
import {
    syntaxHighlighting,
    defaultHighlightStyle,
    bracketMatching,
    indentOnInput
} from '@codemirror/language';
import type { CMWrapperOptions } from '../types';
import { createThemeExtension } from './theme';
import { createPlaceholderExtension } from './placeholder';
import { createFoldingExtension } from './folding';
import { createLanguageExtension } from './languages';
import { createHTMLFoldingExtension } from './html-folding';

export function createExtensions(
    options: CMWrapperOptions,
    isDark: boolean
): Extension[] {
    const { placeholder, readonly, onChange, onFocus, onBlur } = options;

    const extensions: Extension[] = [
        basicSetup,

        // 语言支持（支持 CommonMark HTML 块）
        createLanguageExtension(),

        // HTML 块折叠增强
        createHTMLFoldingExtension(),

        // 代码折叠
        createFoldingExtension(isDark),

        // 其他功能
        bracketMatching(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle),

        keymap.of([indentWithTab]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                onChange?.(update.state.doc.toString());
            }
        }),
        EditorView.domEventHandlers({
            focus: () => onFocus?.(),
            blur: () => onBlur?.()
        }),
        EditorState.readOnly.of(readonly || false),
        createThemeExtension(isDark)
    ];

    if (placeholder && !readonly) {
        extensions.push(createPlaceholderExtension(isDark));
    }

    if (isDark) {
        extensions.push(oneDark);
    }

    return extensions;
}