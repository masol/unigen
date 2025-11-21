import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { foldCode, unfoldCode, foldAll, unfoldAll } from '@codemirror/language';
import { lightStore } from '$lib/stores/config/ipc/light.svelte';
import { eventBus } from '$lib/utils/evt';
import type { CMWrapperOptions, MenuCommand } from './types';
import { createExtensions } from './extensions/index';
import { executeCommand as executeEditorCommand } from './commands';

export class CMWrapper {
    private view: EditorView;
    private options: CMWrapperOptions;
    private themeUnsubscribe?: () => void;

    constructor(options: CMWrapperOptions) {
        this.options = options;
        this.view = this.createEditor();
        this.setupThemeListener();
    }

    private createEditor(): EditorView {
        const state = EditorState.create({
            doc: this.options.initialValue || '',
            extensions: createExtensions(this.options, this.isDarkMode)
        });

        return new EditorView({
            state,
            parent: this.options.parent
        });
    }

    private async setupThemeListener(): Promise<void> {
        this.themeUnsubscribe = await eventBus.listen('theme.change', () => {
            this.updateTheme();
        });
    }

    private updateTheme(): void {
        const currentContent = this.getContent();
        const currentSelection = this.getSelection();

        this.view.setState(
            EditorState.create({
                doc: currentContent,
                extensions: createExtensions(this.options, this.isDarkMode),
                selection: currentSelection
            })
        );
    }

    private get isDarkMode(): boolean {
        return lightStore.mode === 'dark';
    }

    // Public API Methods
    getContent(): string {
        return this.view.state.doc.toString();
    }

    setContent(content: string): void {
        this.view.dispatch({
            changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: content
            }
        });
    }

    focus(): void {
        this.view.focus();
    }

    clear(): void {
        this.setContent('');
    }

    insertAtCursor(text: string): void {
        const { from } = this.view.state.selection.main;
        this.view.dispatch({
            changes: { from, to: from, insert: text }
        });
    }

    destroy(): void {
        this.themeUnsubscribe?.();
        this.view.destroy();
    }

    async executeCommand(cmd: MenuCommand, param?: Record<string, unknown>): Promise<void> {
        await executeEditorCommand(this.view, cmd, param);
    }

    posAtCoords(x: number, y: number): number | null {
        return this.view.posAtCoords({ x, y });
    }

    getSelection(): { anchor: number; head: number } {
        const { anchor, head } = this.view.state.selection.main;
        return { anchor, head };
    }

    // 折叠相关方法
    foldAtCursor(): void {
        foldCode(this.view);
    }

    unfoldAtCursor(): void {
        unfoldCode(this.view);
    }

    foldAllCode(): void {
        foldAll(this.view);
    }

    unfoldAllCode(): void {
        unfoldAll(this.view);
    }

    toggleFold(pos?: number): void {
        if (pos !== undefined) {
            this.view.dispatch({
                selection: { anchor: pos, head: pos }
            });
        }
        foldCode(this.view);
    }
}