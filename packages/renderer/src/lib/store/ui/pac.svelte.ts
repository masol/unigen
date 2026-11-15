// src/lib/store/ui/pac.svelte.ts

import { confirmStore } from '$lib/store/ui/confirm.svelte';
import { safeApi } from '$lib/utils/api';
import { push } from '@keenmate/svelte-spa-router';
import { NavigationCancelledError } from '@keenmate/svelte-spa-router/helpers/navigation-guard';
import { default as log } from 'electron-log/renderer';
import type { PacFileDocument } from '../../../../../main/src/types/shared/api/pac';

// ── 类型 ──

export type PacDocument = PacFileDocument & {
    id: string;
    title: string;
};

type PacStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * 结构化 Editor 适配器接口。
 * 避免 pacStore 直接依赖 Tiptap 具体类型，同时保证与 `Editor` 结构兼容。
 */
export interface EditorSink {
    readonly isDestroyed: boolean;
    commands: {
        setContent: (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content: any,
            options?: {
                emitUpdate?: boolean;
                contentType?: 'markdown' | 'html' | 'json';
            },
        ) => unknown;
    };
}

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
            this.#pushToEditor(this.currentContent);
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
    }

    // ── Actions ──

    /**
     * 打开 PAC 文件。
     *
     * 这是 fileStore 打开指令进入 pac 模块的唯一入口：
     * - 如果当前有未保存的更改，先询问用户是否保存；
     * - 保存失败则中止打开，停留在当前文档；
     * - 用户选择不保存或保存成功后，继续加载新文档。
     */
    async openFile(path: string): Promise<boolean> {
        const normalizedPath = normalizePacPath(path);

        if (!normalizedPath) {
            this.reset();
            return false;
        }

        // 脏检查：当前文档有未保存更改时，询问是否保存。
        // 如果保存失败，阻止切换；用户选择不保存则直接继续。
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

        // 先让路由进入 pacEditor，页面会看到 loading 骨架。
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

            this.#pushToEditor(doc.content);

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

    /** 由编辑器 onUpdate 调用，更新实时 markdown 内容。 */
    setEditorContent(content: string): void {
        if (this.status !== 'ready') return;
        this.currentContent = content;
    }

    /**
     * 保存当前文档。
     * - 非 dirty 直接成功。
     * - 并发调用复用同一 Promise。
     * - 保存成功后 savedContent 为提交时快照；若期间继续编辑，dirty 仍为 true。
     */
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

    /**
     * 路由离开守卫。
     * 由 PageWrapper 在 onMount 中注册。
     * 如果当前有未保存的更改且保存失败，抛出 NavigationCancelledError 阻止离开。
     */
    async beforeLeave(_ctx: unknown): Promise<void> {
        const canLeave = await this.#confirmSaveIfDirty();
        if (!canLeave) {
            throw new NavigationCancelledError();
        }
    }

    /**
     * 脏检查并询问是否保存。
     * @returns true 表示可以继续（无脏数据、用户选择不保存、或保存成功）
     *          false 表示应中止（保存失败）
     */
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

                // 用户选择不保存，允许继续（离开或切换文件）。
                return true;
            } finally {
                this.#confirmPromise = null;
            }
        })();

        return this.#confirmPromise;
    }

    /** 重置所有状态，并取消进行中的 load。 */
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