// src/lib/store/ui/pac.svelte.ts

import { confirmStore } from '$lib/store/ui/confirm.svelte';
import { safeApi } from '$lib/utils/api';
import { location, push } from '@keenmate/svelte-spa-router';
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

const PAC_EDITOR_ROUTE = '/paceditor';

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

function currentRoutePath(): string {
    const current = location();
    if (typeof current !== 'string') return '';

    const withoutHash = current.startsWith('#') ? current.slice(1) : current;
    return withoutHash.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}

function isPacEditorRouteActive(): boolean {
    return currentRoutePath() === PAC_EDITOR_ROUTE;
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

/**
 * 将任意字符串包装为 Markdown 行内代码，避免文件名中的 `*`、`_`、`[` 等
 * 字符破坏渲染；名称自身含反引号时用双反引号围栏并补空格（CommonMark 规则）。
 */
function markdownCodeSpan(value: string): string {
    if (value.includes('`')) {
        return `\`\` ${value} \`\``;
    }
    return `\`${value}\``;
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

    /**
     * 本轮离开已确认“不保存并放弃修改”。
     *
     * 同一个导航可能被多个守卫串行调用 beforeLeave。用户第一次选择
     * “不保存”后，dirty 仍然为 true；如果不记住该决定，第二个守卫会
     * 再次弹窗。该标记只用于同一轮离开确认，内容再次变化 / 保存成功 /
     * 打开新文档 / reset 时清除。
     */
    #discardConfirmed = false;

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

    /** 当前文档解析出的错误数。打开新文件时重置为 0，解析完成后由解析器写入。 */
    #errorCount = $state(0);

    // ── 派生 ──

    /**
     * 脏状态的唯一真源：只做内容比较，不做“无条件置 true”。
     *
     * Svelte 的 $state.raw 在赋值相同原始值时不会触发不必要的更新，
     * 因此 `!==` 对字符串的值比较就是 dirty 的唯一真源：用户撤销、
     * 改回原文时 currentContent 会重新等于 savedContent，dirty 自动回到 false。
     *
     * UI（dirty 派生）和导航守卫（#confirmSaveIfDirty）都走这里，
     * 避免两处各自实现导致逻辑漂移。
     */
    #isDirty(): boolean {
        return (
            this.doc !== null &&
            this.currentContent !== null &&
            this.savedContent !== null &&
            this.currentContent !== this.savedContent
        );
    }

    readonly dirty = $derived(this.#isDirty());

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

    // ── 错误数 ──

    /** 当前文档的错误数。打开新文件时自动重置为 0。 */
    get errorCount(): number {
        return this.#errorCount;
    }

    /**
     * 由解析器在文档解析完成后调用。
     * 打开新文件时 errorCount 已被重置为 0，解析期间保持 0，解析完成后再写入真实值。
     */
    setErrorCount(count: number): void {
        this.#errorCount = Math.max(0, count);
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

        /**
         * 忽略重复打开的判定必须同时满足：
         *   1. 当前已在编辑器路由内 —— 否则编辑器已被卸载，store 中的
         *      currentContent / doc 不可作为“编辑器已就绪”的依据；
         *   2. 路径与当前文档一致；
         *   3. 文档状态为 ready。
         *
         * 只要其中任一不满足，都走完整加载流程。路径不同一律重新加载；
         * 从其它路由进入即使路径相同也重新加载，避免编辑器挂载后无内容。
         */
        const isReusable =
            isPacEditorRouteActive() &&
            this.currentId === normalizedPath &&
            this.status === 'ready';

        if (isReusable) return true;

        // 同一路径正在加载：忽略重复请求，避免并发读盘。
        if (this.currentId === normalizedPath && this.status === 'loading') {
            if (!isPacEditorRouteActive()) {
                push(PAC_EDITOR_ROUTE);
            }
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
        this.#errorCount = 0; // 打开新文件：错误数先归零，等解析完成再写入

        if (!isPacEditorRouteActive()) {
            push(PAC_EDITOR_ROUTE);
        }

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
            this.#discardConfirmed = false;

            this.#hydrating = true;
            try {
                this.#pushToEditor(doc.content);
            } finally {
                this.#hydrating = false;
            }

            // 解析完成：此处由真实解析器写入 errorCount。
            // 目前占位为 0，等解析逻辑接入后改为 this.#errorCount = parseResult.errorCount。
            this.#errorCount = 0;

            log.info(`[PacStore] opened, path=${normalizedPath}`);
            return true;
        } catch (error) {
            if (requestId !== this.#requestId) return false;

            this.error = error instanceof Error ? error.message : '文档加载失败';
            this.status = 'error';
            this.#errorCount = 0; // 加载失败也保持 0，避免残留上个文件的错误数

            log.error(`[PacStore] openFile failed, path=${normalizedPath}`, error);
            return false;
        }
    }

    /**
     * 关闭当前文档：导航回根路由并重置内部状态。
     *
     * 未保存更改的确认在这里主动调用一次（关闭时当前路由未必是
     * /paceditor，push 不一定触发 beforeLeave）；若 beforeLeave 仍被
     * 触发，dirty 已清除或 #discardConfirmed 已置位，不会二次弹窗。
     *
     * push 被取消（用户放弃导航 / 保存失败）时保留当前状态并返回 false。
     */
    async closeFile(): Promise<boolean> {
        if (!this.currentId && this.status === 'idle') {
            return true;
        }

        const canProceed = await this.#confirmSaveIfDirty();
        if (!canProceed) return false;

        try {
            await push('/');
        } catch (error) {
            if (!(error instanceof NavigationCancelledError)) {
                log.warn('[PacStore] closeFile navigation failed', error);
            }
            return false;
        }

        this.reset();
        return true;
    }

    /**
     * 由编辑器 onUpdate 调用，更新实时 markdown 内容。
     *
     * #hydrating 期间（attach/填充中）拒绝任何回写，防止空文档污染真源。
     *
     * 同时校验来源编辑器：编辑器 detach 后、destroy 过程中仍可能触发
     * onUpdate；若此时仍写入 currentContent，会把已保存文档误置为 dirty，
     * 导致退出守卫在无需保存时弹窗。只接受当前绑定编辑器的回写。
     *
     * 注意：不再用“空内容不得覆盖非空已保存内容”作为守卫。
     * 那个守卫会阻止用户合法地把文档清空到与已保存内容不同的空状态，
     * 导致 dirty 无法正确反映“用户已删除全部内容”。
     * 初始化期间的空串污染已经由 #hydrating 覆盖；如果编辑器在就绪后
     * 产生空串，它应当被视为一次真实的编辑。
     */
    setEditorContent(content: string, editor?: EditorSink): void {
        if (this.status !== 'ready') return;
        if (this.#hydrating) return;
        if (!this.#editor) return;
        if (editor && this.#editor !== editor) return;

        if (content === this.currentContent) return;

        this.currentContent = content;
        this.#discardConfirmed = false;
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
                this.#discardConfirmed = false;
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
        // 编辑器已解绑时不应再处理离开确认；此时若仍读取旧内容，
        // 很容易被 detach/destroy 阶段的 onUpdate 误判为 dirty。
        if (!this.#editor) return;

        const canLeave = await this.#confirmSaveIfDirty();
        if (!canLeave) {
            throw new NavigationCancelledError();
        }
    }

    async #confirmSaveIfDirty(): Promise<boolean> {
        // 与 UI 的 dirty 派生共用同一实现，避免两处逻辑漂移。
        if (!this.#isDirty()) return true;

        // 同一轮离开已被确认过“不保存并放弃修改”，后续守卫直接放行。
        if (this.#discardConfirmed) return true;

        if (this.#confirmPromise) return this.#confirmPromise;

        this.#confirmPromise = (async () => {
            try {
                // dirty 为 true 时 doc 必非空；此处仍保留回退以保证健壮性。
                const fileName =
                    this.doc?.title ||
                    (this.currentId ? titleFromPath(this.currentId) : '当前文档');

                const shouldSave = await confirmStore.request({
                    title: '保存更改？',
                    // 文件名用行内代码包裹：既突出显示，又避免 `*`、`_`、`[` 等
                    // 特殊字符破坏 Markdown 渲染（confirmStore 已支持 markdown）。
                    message: `文档 ${markdownCodeSpan(fileName)} 有未保存的更改，是否保存？`,
                    // markdown: false,
                    // “取消”在此语境下语义模糊（取消保存？还是取消本次离开？），
                    // 直接表述为“不保存”更贴近用户心智。
                    confirmLabel: '保存',
                    cancelLabel: '不保存',
                });

                if (shouldSave) {
                    return await this.save();
                }

                this.#discardConfirmed = true;
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
        this.#discardConfirmed = false;
        this.#errorCount = 0;

        log.debug('[PacStore] reset()');
    }
}

const KEY = Symbol.for('unigen.renderer.pacStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pacStore: PacStore = ((globalThis as any)[KEY] ??= new PacStore());