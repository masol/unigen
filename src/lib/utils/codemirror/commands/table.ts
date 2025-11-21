import { insertText } from './formatting';
import type { EditorView } from '@codemirror/view';

const TABLE_TEMPLATE = `
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`;

export function insertTable(view: EditorView): void {
    insertText(view, TABLE_TEMPLATE);
}