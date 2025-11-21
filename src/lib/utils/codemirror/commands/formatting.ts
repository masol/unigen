import type { EditorView } from '@codemirror/view';

export function insertMarkdown(
    view: EditorView,
    before: string,
    after: string
): void {
    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);

    view.dispatch({
        changes: {
            from,
            to,
            insert: `${before}${selectedText || 'text'}${after}`
        },
        selection: {
            anchor: from + before.length,
            head: to + before.length + (selectedText ? 0 : 4)
        }
    });
}

export function insertLinePrefix(view: EditorView, prefix: string): void {
    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);

    view.dispatch({
        changes: {
            from: line.from,
            to: line.from,
            insert: prefix
        }
    });
}

export function insertText(view: EditorView, text: string): void {
    const { from } = view.state.selection.main;

    view.dispatch({
        changes: {
            from,
            to: from,
            insert: text
        }
    });
}