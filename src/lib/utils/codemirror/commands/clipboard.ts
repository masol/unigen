import type { EditorView } from '@codemirror/view';

export async function handlePaste(view: EditorView): Promise<void> {
    try {
        const text = await navigator.clipboard.readText();
        const { from, to } = view.state.selection.main;
        view.dispatch({
            changes: { from, to, insert: text }
        });
    } catch (err) {
        console.error('Failed to paste:', err);
    }
}

export function handleCut(): void {
    document.execCommand('cut');
}

export function handleCopy(): void {
    document.execCommand('copy');
}

export function handleDelete(view: EditorView): void {
    const { from, to } = view.state.selection.main;
    view.dispatch({
        changes: { from, to, insert: '' }
    });
}

export function handleSelectAll(view: EditorView): void {
    view.dispatch({
        selection: { anchor: 0, head: view.state.doc.length }
    });
}