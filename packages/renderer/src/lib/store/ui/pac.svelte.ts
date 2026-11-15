// src/lib/store/ui/pac.svelte.ts

import { confirmStore } from '$lib/store/ui/confirm.svelte';
import { safeApi } from '$lib/utils/api';
import { push } from '@keenmate/svelte-spa-router';
import { NavigationCancelledError } from '@keenmate/svelte-spa-router/helpers/navigation-guard';
import type { Editor as EditorSink } from '@tiptap/core';
import { default as log } from 'electron-log/renderer';
import { history } from 'prosemirror-history';
import type { PacFileDocument } from '../../../../../main/src/types/shared/api/pac';

// ── 类型 ──

export type PacDocument = PacFileDocument & {
    id: string;
    title: string;
};

type PacStatus = 'idle' | 'loading' | 'ready' | 'error';

// ── 工具函数 ──

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function titleFromPath(path: string): string {
    const decoded = safeDecode(path);
    return decoded.split('/').filter(Boolean).at(-1) ?? decoded;
}

function normalizePacPath(path: string): string {
    return path.trim();
}

function normalizeDocument(
    requestedPath: string,
    source?: PacFileDocument | null,
): PacDocument {
    const actualPath = source?.path?.trim() || requestedPath;

    return {
        id: requestedPath,
        title: titleFromPath(actualPath),
        path: actualPath,
        meta: source?.meta ?? {},
        content: typeof source?.content === 'string' ? source.content : '',
        updatedAt: source?.updatedAt,
    };
}

// ── Store ──

class PacStore {
    // ── 私有状态 ──

    /** 请求序号：忽略过期的 load 响应 */
    #requestId = 0;

    /** 保存中的单飞 Promise */
    #savePromise: Promise<boolean> | null = null;

    /** 脏检查确认中的单飞 Promise，避免并发弹窗 */
    #confirmPromise: Promise<boolean> | null = null;

    #editor: EditorSink | null = null;

    /**
     * 编辑器填充中标志。
     * attachEditor 调用 #pushToEditor 期间置 true，
     * 用于阻断编辑器初始化触发的 onUpdate 反向同步，
     * 防止空文档污染 store 中的真源内容。
     */
    #hydrating = false;

    // ── 响应式状态 ──

    status = $state<PacStatus>('idle');
    currentId = $state<string | null>(null);
    doc = $state.raw<PacDocument | null>(null);
    currentContent = $state.raw<string | null>(null);
    savedContent = $state.raw<string | null>(null);
    error = $state<string | null>(null);
    saveError = $state<string | null>(null);
    saving = $state(false);
    revision = $state(0);

    // ── 派生 ──

    /**
     * 脏状态完全由内容比较决定，不做“无条件置 true”。
     * Svelte 的 $state.raw 在赋值相同原始值时不会触发不必要的更新，
     * 因此这里 `!==` 对字符串的值比较就是 dirty 的唯一真源：
     * 用户撤销、改回原文时 currentContent 会重新等于 savedContent，
     * dirty 自动回到 false。
     */
    readonly dirty = $derived(
        this.doc !== null &&
        this.currentContent !== null &&
        this.savedContent !== null &&
        this.currentContent !== this.savedContent,
    );

    readonly title = $derived(
        this.doc?.title ?? (this.currentId ? titleFromPath(this.currentId) : ''),
    );

    readonly isLoading = $derived(this.status === 'loading' || this.status === 'idle');
    readonly isReady = $derived(this.status === 'ready');
    readonly isError = $derived(this.status === 'error');

    // ── 构造 ──

    constructor() {
        log.info('[PacStore] initialized');
    }

    // ── 编辑器绑定 ──

    attachEditor(editor: EditorSink): void {
        this.#editor = editor;
        if (this.currentContent !== null) {
            this.#hydrating = true;
            try {
                this.#pushToEditor(this.currentContent);
            } finally {
                this.#hydrating = false;
            }
        }
    }

    detachEditor(editor?: EditorSink): void {
        if (!editor || this.#editor === editor) {
            this.#editor = null;
        }
    }

    #pushToEditor(content: string): void {
        const editor = this.#editor;
        if (!editor) return;
        if (editor.isDestroyed) {
            this.#editor = null;
            return;
        }

        editor.commands.setContent(content, {
            emitUpdate: false,
            contentType: 'markdown',
        });

        this.#resetHistory(editor);
    }

    /**
     * 加载新文档后重置编辑器状态，清空 undo/redo 历史。
     */
    #resetHistory(editor: EditorSink): void {
        try {
            editor.unregisterPlugin('history');
            editor.registerPlugin(history());
        } catch (error) {
            log.warn('[PacStore] failed to reset editor history', error);
        }
    }

    // ── Actions ──

    async openFile(path: string): Promise<boolean> {
        const normalizedPath = normalizePacPath(path);

        if (!normalizedPath) {
            this.reset();
            return false;
        }

        const canProceed = await this.#confirmSaveIfDirty();
        if (!canProceed) return false;

        const requestId = ++this.#requestId;

        log.debug(`[PacStore] openFile(), path=${normalizedPath}`);

        this.status = 'loading';
        this.currentId = normalizedPath;
        this.error = null;
        this.saveError = null;
        this.doc = null;
        this.currentContent = null;
        this.savedContent = null;
        this.revision = 0;

        push('/paceditor');

        try {
            const source = (await safeApi().project.readPacFile({
                path: normalizedPath,
            })) as PacFileDocument | null | undefined;

            if (requestId !== this.#requestId) return false;

            const doc = normalizeDocument(normalizedPath, source);

            this.doc = doc;
            this.currentContent = doc.content;
            this.savedContent = doc.content;
            this.revision += 1;
            this.status = 'ready';

            this.#hydrating = true;
            try {
                this.#pushToEditor(doc.content);
            } finally {
                this.#hydrating = false;
            }

            log.info(`[PacStore] opened, path=${normalizedPath}`);
            return true;
        } catch (error) {
            if (requestId !== this.#requestId) return false;

            this.error = error instanceof Error ? error.message : '文档加载失败';
            this.status = 'error';

            log.error(`[PacStore] openFile failed, path=${normalizedPath}`, error);
            return false;
        }
    }

    /**
     * 由编辑器 onUpdate 调用，更新实时 markdown 内容。
     *
     * #hydrating 期间（attach/填充中）拒绝任何回写，防止空文档污染真源。
     *
     * 注意：不再用“空内容不得覆盖非空已保存内容”作为守卫。
     * 那个守卫会阻止用户合法地把文档清空到与已保存内容不同的空状态，
     * 导致 dirty 无法正确反映“用户已删除全部内容”。
     * 初始化期间的空串污染已经由 #hydrating 覆盖；如果编辑器在就绪后
     * 产生空串，它应当被视为一次真实的编辑。
     */
    setEditorContent(content: string): void {
        if (this.status !== 'ready') return;
        if (this.#hydrating) return;

        if (content === this.currentContent) return;

        this.currentContent = content;
    }

    async save(): Promise<boolean> {
        const doc = this.doc;

        if (!doc || !this.dirty) return true;
        if (this.#savePromise) return this.#savePromise;

        const docPath = doc.path;
        const snapshot = this.currentContent ?? '';

        this.saving = true;
        this.saveError = null;

        log.debug(`[PacStore] save(), path=${docPath}`);

        this.#savePromise = (async () => {
            try {
                const result = await safeApi().project.savePacFile({
                    path: docPath,
                    meta: doc.meta,
                    content: snapshot,
                });

                if (!this.doc || this.doc.path !== docPath) return false;

                const updatedAt =
                    typeof (result as { updatedAt?: unknown } | null)?.updatedAt === 'number'
                        ? (result as { updatedAt: number }).updatedAt
                        : Date.now();

                this.savedContent = snapshot;
                this.doc = {
                    ...this.doc,
                    content: snapshot,
                    updatedAt,
                };

                log.info(`[PacStore] saved, path=${docPath}`);
                return true;
            } catch (error) {
                this.saveError = error instanceof Error ? error.message : '保存失败';
                log.error(`[PacStore] save failed, path=${docPath}`, error);
                return false;
            } finally {
                this.saving = false;
                this.#savePromise = null;
            }
        })();

        return this.#savePromise;
    }

    async beforeLeave(_ctx: unknown): Promise<void> {
        const canLeave = await this.#confirmSaveIfDirty();
        if (!canLeave) {
            throw new NavigationCancelledError();
        }
    }

    async #confirmSaveIfDirty(): Promise<boolean> {
        if (!this.dirty) return true;
        if (this.#confirmPromise) return this.#confirmPromise;

        this.#confirmPromise = (async () => {
            try {
                const shouldSave = await confirmStore.request({
                    title: '保存更改？',
                    message: '当前文档有未保存的更改，是否保存？',
                });

                if (shouldSave) {
                    return await this.save();
                }

                return true;
            } finally {
                this.#confirmPromise = null;
            }
        })();

        return this.#confirmPromise;
    }

    reset(): void {
        this.#requestId += 1;
        this.status = 'idle';
        this.currentId = null;
        this.doc = null;
        this.currentContent = null;
        this.savedContent = null;
        this.error = null;
        this.saveError = null;
        this.saving = false;
        this.revision = 0;

        log.debug('[PacStore] reset()');
    }
}

const KEY = Symbol.for('unigen.renderer.pacStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pacStore: PacStore = ((globalThis as any)[KEY] ??= new PacStore());