import type { EditorView } from '@codemirror/view';
import type { MenuCommand } from '../types';
import { insertMarkdown, insertLinePrefix, insertText } from './formatting';
import { handlePaste, handleCut, handleCopy, handleDelete, handleSelectAll } from './clipboard';
import { insertTable } from './table';

export async function executeCommand(
    view: EditorView,
    cmd: MenuCommand,
    param?: Record<string, unknown>
): Promise<void> {
    void param;

    switch (cmd) {
        case 'bold':
            insertMarkdown(view, '**', '**');
            break;
        case 'italic':
            insertMarkdown(view, '*', '*');
            break;
        case 'strikethrough':
            insertMarkdown(view, '~~', '~~');
            break;
        case 'code':
            insertMarkdown(view, '`', '`');
            break;
        case 'code-block':
            insertMarkdown(view, '```\n', '\n```');
            break;
        case 'heading1':
            insertLinePrefix(view, '# ');
            break;
        case 'heading2':
            insertLinePrefix(view, '## ');
            break;
        case 'heading3':
            insertLinePrefix(view, '### ');
            break;
        case 'heading4':
            insertLinePrefix(view, '#### ');
            break;
        case 'heading5':
            insertLinePrefix(view, '##### ');
            break;
        case 'heading6':
            insertLinePrefix(view, '###### ');
            break;
        case 'quote':
            insertLinePrefix(view, '> ');
            break;
        case 'list':
            insertLinePrefix(view, '- ');
            break;
        case 'numbered-list':
            insertLinePrefix(view, '1. ');
            break;
        case 'task-list':
            insertLinePrefix(view, '- [ ] ');
            break;
        case 'link':
            insertMarkdown(view, '[', '](url)');
            break;
        case 'image':
            insertMarkdown(view, '![alt](', ')');
            break;
        case 'table':
            insertTable(view);
            break;
        case 'horizontal-rule':
            insertText(view, '\n---\n');
            break;
        case 'cut':
            handleCut();
            break;
        case 'copy':
            handleCopy();
            break;
        case 'paste':
            await handlePaste(view);
            break;
        case 'delete':
            handleDelete(view);
            break;
        case 'select-all':
            handleSelectAll(view);
            break;
    }

    view.focus();
}