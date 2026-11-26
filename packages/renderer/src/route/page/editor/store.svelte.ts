import { bottomPanelStore } from '$lib/store/local/bottombar.store.svelte';
import { projectStore } from '$lib/store/project.svelte';
import { layoutStore } from '$lib/store/ui/layout.svelte';
import { safeApi } from '$lib/utils/api';
import Logger from 'electron-log/renderer';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { BlueprintKind } from '../../featured/rightside/glossary/store.svelte';

export type { BlueprintKind };
export type EditorLang = 'markdown' | 'json' | 'js';
export type CntParam = EditorLang | 'new' | '';

export interface PathAsset {
    fullKey: string;
    relative: string;
}

interface LoadResult {
    content: string;
}

export interface RouteParams {
    kind: BlueprintKind;
    id: string;
    contentFmt: CntParam;
}

/**
 * init() 的规范化结果。
 * 关键点：contentFmt 为 'new' 时内部状态是 ''，所以 routeKey 必须额外带上
 * isNew 标记，否则“新建某条目”和“编辑同一条目”会得到相同的 key。
 */
interface NormalizedRoute {
    kind: BlueprintKind;
    id: string;
    contentFmt: CntParam;
    isNew: boolean;
    routeKey: string;
}

const MONACO_LANG: Record<EditorLang, string> = {
    markdown: 'markdown',
    json: 'json',
    js: 'javascript'
};

const KIND_LABEL: Record<BlueprintKind, string> = {
    glossary: 'Glossary',
    metag: 'MetaG',
    capa: 'Capa'
};

const LANG_LABEL: Record<EditorLang, string> = {
    markdown: 'Markdown',
    json: 'JSON',
    js: 'JavaScript'
};

export class EditorStore {
    private bCreateNew = false;

    kind = $state<BlueprintKind>('glossary');
    id = $state<string>('');
    contentFmt = $state<CntParam>('');

    content = $state<string>('');
    loadedContent = $state<string>('');

    /** 已完成加载的路由键（包含 new 标记） */
    private loadedKey: string | null = null;
    /** 正在加载的路由键，用于合并重复 init */
    private inflightKey: string | null = null;
    /** 递增请求序号，防止迟到的响应覆盖新路由 */
    private loadSeq = 0;

    loading = $state<boolean>(false);
    busy = $state<boolean>(false);
    busyAction = $state<'save' | 'reload' | null>(null);

    lastError = $state<string | null>(null);

    cursorLine = $state<number>(1);
    cursorColumn = $state<number>(1);
    selectionLength = $state<number>(0);
    wordWrap = $state<boolean>(true);
    minimap = $state<boolean>(true);

    private resolveLang(
        kind: BlueprintKind,
        id: string,
        content: CntParam,
        loadedContent: string
    ): EditorLang {
        if (kind === 'glossary') {
            if (content) return 'markdown';
            return sniffContentLang(loadedContent);
        }
        if (kind === 'capa') {
            if (content) return content as EditorLang;
        }
        return 'json';
    }

    editorLang = $derived(
        this.resolveLang(this.kind, this.id, this.contentFmt, this.loadedContent)
    );
    language = $derived(MONACO_LANG[this.editorLang]);
    kindLabel = $derived(KIND_LABEL[this.kind]);
    langLabel = $derived(LANG_LABEL[this.editorLang]);
    fileName = $derived(`${this.id || 'untitled'}.${this.extForLang(this.editorLang)}`);
    dirty = $derived(this.content !== this.loadedContent);
    readonly = $derived(this.busy || this.loading);
    charCount = $derived(this.content.length);
    lineCount = $derived(this.content.length === 0 ? 1 : this.content.split('\n').length);

    readonly pathAssets = $derived.by<PathAsset[]>(() => {
        if (this.editorLang !== 'json') return [];
        const text = this.content.trim();
        if (!text) return [];

        let obj: unknown;
        try {
            obj = JSON.parse(text);
        } catch {
            return [];
        }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];

        const out: PathAsset[] = [];
        for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
            if (!/_path$/i.test(key)) continue;
            if (typeof val !== 'string') continue;
            const relative = val.trim();
            if (!relative || !isRelativePath(relative)) continue;
            out.push({ fullKey: key, relative });
        }
        return out;
    });

    private extForLang(l: EditorLang): string {
        return l === 'markdown' ? 'md' : l === 'js' ? 'js' : 'json';
    }

    private normalizeRoute(params: RouteParams): NormalizedRoute {
        const rawFmt: CntParam = params.contentFmt ?? '';
        const isNew = rawFmt === 'new';
        const kind: BlueprintKind = params.kind ?? 'glossary';
        const id = (params.id ?? '').trim();
        const contentFmt: CntParam = isNew ? '' : rawFmt;

        return {
            kind,
            id,
            contentFmt,
            isNew,
            routeKey: `${kind}::${id}::${isNew ? 'new' : String(contentFmt)}`,
        };
    }

    private currentRoute(): NormalizedRoute {
        return this.normalizeRoute({
            kind: this.kind,
            id: this.id,
            contentFmt: this.bCreateNew ? 'new' : this.contentFmt,
        });
    }

    async init(params: RouteParams): Promise<void> {
        const route = this.normalizeRoute(params);

        // Logger.debug('[EditorStore] init', {
        //     route,
        //     current: {
        //         kind: this.kind,
        //         id: this.id,
        //         contentFmt: this.contentFmt,
        //         isNew: this.bCreateNew,
        //     },
        //     loadedKey: this.loadedKey,
        //     inflightKey: this.inflightKey,
        //     loading: this.loading,
        //     busy: this.busy,
        // });

        // 完全相同的路由已经加载完毕：保持现场（包括未保存的编辑内容）
        if (route.routeKey === this.loadedKey && !this.loading) {
            this.kind = route.kind;
            this.id = route.id;
            this.contentFmt = route.contentFmt;
            this.bCreateNew = route.isNew;
            return;
        }

        // 同一路由正在加载中：不要重复发起请求。
        // init 可能因为父组件更新、HMR、回调等原因被多次调用。
        if (this.loading && this.inflightKey === route.routeKey) {
            return;
        }

        this.kind = route.kind;
        this.id = route.id;
        this.contentFmt = route.contentFmt;
        this.bCreateNew = route.isNew;

        await this.load(route);
    }

    private async load(route: NormalizedRoute): Promise<void> {
        const seq = ++this.loadSeq;
        this.inflightKey = route.routeKey;
        this.loading = true;
        this.lastError = null;

        // Logger.debug('[EditorStore] load start', {
        //     routeKey: route.routeKey,
        //     seq,
        // });

        try {
            const result = route.isNew
                ? { content: '' }
                : await this.loadFromSource(route);

            if (seq !== this.loadSeq) {
                Logger.debug('[EditorStore] load dropped (stale)', {
                    routeKey: route.routeKey,
                    seq,
                    latest: this.loadSeq,
                });
                return;
            }

            this.content = result.content;
            this.loadedContent = result.content;
            this.loadedKey = route.routeKey;

            // Logger.debug('[EditorStore] load done', {
            //     routeKey: route.routeKey,
            //     seq,
            //     length: result.content.length,
            // });
        } catch (e) {
            if (seq !== this.loadSeq) return;
            this.lastError = e instanceof Error ? e.message : String(e);
            Logger.error('[EditorStore] load failed', {
                routeKey: route.routeKey,
                seq,
                error: e,
            });
        } finally {
            if (seq === this.loadSeq) {
                this.loading = false;
                this.inflightKey = null;
            }
        }
    }

    async save(): Promise<void> {
        if (this.busy || this.loading) return;

        const route = this.currentRoute();
        if (!route.id) {
            Logger.warn('[EditorStore] save ignored: empty id');
            return;
        }

        const contentSnapshot = this.content;
        // 语言判断必须在快照时刻完成：await 期间路由/内容可能变化
        const needsJsonWrap =
            route.kind === 'glossary' &&
            route.contentFmt.length === 0 &&
            this.editorLang !== 'json';

        this.busy = true;
        this.busyAction = 'save';

        Logger.debug('[EditorStore] save start', {
            route,
            needsJsonWrap,
            length: contentSnapshot.length,
        });

        try {
            const payload = needsJsonWrap
                ? JSON.stringify(contentSnapshot)
                : contentSnapshot;

            await safeApi().project.setContent({
                id: route.id,
                kind: route.kind,
                content: payload,
                code: route.contentFmt.length > 0,
            });

            /*
             * 只有仍然停留在保存时的条目上，才更新 loadedContent。
             * 否则保存期间切换路由，会把新条目的内容误标记为“已保存”。
             */
            if (this.currentRoute().routeKey === route.routeKey) {
                this.loadedContent = contentSnapshot;
            }
            this.lastError = null;

            Logger.debug('[EditorStore] save done', {
                routeKey: route.routeKey,
            });
        } catch (e) {
            this.lastError = e instanceof Error ? e.message : String(e);
            Logger.error('[EditorStore] save failed', e);
        } finally {
            this.busy = false;
            this.busyAction = null;
        }
    }

    async reload(): Promise<void> {
        if (this.busy || this.loading) return;

        const route = this.currentRoute();
        if (!route.id && !route.isNew) return;

        this.busy = true;
        this.busyAction = 'reload';

        const seq = ++this.loadSeq;
        this.inflightKey = route.routeKey;

        Logger.debug('[EditorStore] reload start', {
            routeKey: route.routeKey,
            seq,
        });

        try {
            const result = route.isNew
                ? { content: '' }
                : await this.loadFromSource(route);

            if (seq !== this.loadSeq) return;

            this.content = result.content;
            this.loadedContent = result.content;
            this.loadedKey = route.routeKey;
            this.lastError = null;

            Logger.debug('[EditorStore] reload done', {
                routeKey: route.routeKey,
                seq,
            });
        } catch (e) {
            if (seq === this.loadSeq) {
                this.lastError = e instanceof Error ? e.message : String(e);
            }
            Logger.error('[EditorStore] reload failed', e);
        } finally {
            this.busy = false;
            this.busyAction = null;
            if (seq === this.loadSeq) {
                this.inflightKey = null;
            }
        }
    }

    private _editor: MonacoEditor.IStandaloneCodeEditor | null = null;
    attachEditor(ed: MonacoEditor.IStandaloneCodeEditor) {
        this._editor = ed;
    }
    detachEditor(ed?: MonacoEditor.IStandaloneCodeEditor) {
        if (!ed || this._editor === ed) this._editor = null;
    }
    private runFocused(fn: (ed: MonacoEditor.IStandaloneCodeEditor) => void) {
        const ed = this._editor;
        if (!ed) return;
        ed.focus();
        requestAnimationFrame(() => {
            const cur = this._editor;
            if (!cur || cur !== ed) return;
            fn(cur);
        });
    }
    undo() { this.runFocused((ed) => ed.trigger('toolbar', 'undo', null)); }
    redo() { this.runFocused((ed) => ed.trigger('toolbar', 'redo', null)); }
    format() { this.runFocused((ed) => ed.getAction('editor.action.formatDocument')?.run()); }
    find() { this.runFocused((ed) => ed.getAction('actions.find')?.run()); }
    commandPalette() { this.runFocused((ed) => ed.getAction('editor.action.quickCommand')?.run()); }
    toggleWordWrap() { this.wordWrap = !this.wordWrap; }
    toggleMinimap() { this.minimap = !this.minimap; }

    setCursor(line: number, column: number, selLen: number) {
        this.cursorLine = line;
        this.cursorColumn = column;
        this.selectionLength = selLen;
    }

    onContentChanged(_next: string): void {
        // no-op：pathAssets 自动跟随 content 派生。
    }

    async previewAsset(relative: string): Promise<string | null> {
        try {
            const url = await safeApi().project.getURL(relative);
            projectStore.mediaURL = url;
            // 开始确认打开下方面板打开。
            layoutStore.openPanel("bottom");
            bottomPanelStore.setActiveTab("media");
            return url;
        } catch (e) {
            Logger.error(`[EditorStore] previewAsset failed: ${relative}`, e);
            return null;
        }
    }

    async openAsset(relative: string): Promise<void> {
        try {
            await safeApi().system.openPath({ path: relative });
        } catch (e) {
            Logger.error(`[EditorStore] openAsset failed: ${relative}`, e);
        }
    }

    private async loadFromSource(route: NormalizedRoute): Promise<LoadResult> {
        if (!route.id) return { content: '' };

        const code = route.contentFmt.length > 0;
        const raw = await safeApi().project.getContent({
            kind: route.kind,
            id: route.id,
            content: code
        });

        if (!raw) return { content: '' };

        // 术语表非 code 模式下，存储的是 JSON 值，需要还原为编辑器显示文本。
        if (route.kind === 'glossary' && !code) {
            try {
                const parsed = JSON.parse(raw);
                if (typeof parsed === 'string') {
                    // 纯文本内容（如 markdown 原文），直接作为编辑内容
                    return { content: parsed };
                } else {
                    // 对象/数组等，格式化为 JSON 字符串供编辑器展示
                    return { content: JSON.stringify(parsed, null, 2) };
                }
            } catch {
                // 兼容旧数据：未包装的纯文本（可能无引号），直接使用
                return { content: raw };
            }
        }

        // 其他情况（code 模式或非 glossary）直接使用原始内容
        return { content: raw };
    }
}

const KEY = Symbol.for('unigen.renderer.editorStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const editorStore: EditorStore = ((globalThis as any)[KEY] ??= new EditorStore());

function sniffContentLang(text: string): EditorLang {
    const t = text.trim();
    if (!t) return 'json';
    const head = t[0];
    if (head === '{' || head === '[') {
        try {
            const v = JSON.parse(t);
            if (v && typeof v === 'object') return 'json';
        } catch { /* fallthrough */ }
    }
    return 'markdown';
}

function isRelativePath(p: string): boolean {
    const v = p.trim();
    if (!v) return false;
    if (v.startsWith('/')) return false;
    if (v.startsWith('\\\\')) return false;
    if (/^[a-zA-Z]:[\\/]/.test(v)) return false;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v)) return false;
    if (/^(data|blob):/i.test(v)) return false;
    return true;
}