import * as monaco from 'monaco-editor';

export type EditorKind = 'markdown' | 'json' | 'js';

export interface LoadResult {
    kind: EditorKind;
    content: string;
}

export interface RouteParams {
    kind: EditorKind;
    id: string;
    content?: boolean;
}

/** 校验结果条目 */
export interface ValidationIssue {
    severity: 'error' | 'warning';
    line: number;
    column: number;
    message: string;
}

const MONACO_LANG: Record<EditorKind, string> = {
    markdown: 'markdown',
    json: 'json',
    js: 'javascript'
};

const KIND_LABEL: Record<EditorKind, string> = {
    markdown: 'Markdown',
    json: 'JSON',
    js: 'JavaScript'
};

/**
 * 编辑器状态枢纽（全局单例）—— 子组件全部读写 editorStore，彼此不直接通信。
 * 组件可频繁销毁/重建；只要身份指纹（kind+id+content）不变，即复用内存内容不重载。
 */
export class EditorStore {
    // ── 路由参数 ──
    kind = $state<EditorKind>('markdown');
    id = $state<string>('');
    /** 路由传入的 content 参数（是否随路由预置内容） */
    preferInlineContent = $state<boolean>(false);

    // ── 内容与状态 ──
    content = $state<string>('');
    private loadedContent = $state<string>('');

    /** 当前已加载内容的身份指纹；为空表示尚未加载 */
    private loadedKey: string | null = null;

    loading = $state<boolean>(false);
    /** 任一异步动作（保存/重载/验证）进行中 —— 期间编辑区只读 */
    busy = $state<boolean>(false);
    busyAction = $state<'save' | 'reload' | 'validate' | null>(null);

    issues = $state<ValidationIssue[]>([]);
    lastError = $state<string | null>(null);

    // ── 编辑器元信息（由 MonacoEditor 组件回写，供状态栏读取）──
    cursorLine = $state<number>(1);
    cursorColumn = $state<number>(1);
    selectionLength = $state<number>(0);
    wordWrap = $state<boolean>(true);
    minimap = $state<boolean>(true);

    // ── 派生 ──
    language = $derived(MONACO_LANG[this.kind]);
    kindLabel = $derived(KIND_LABEL[this.kind]);
    fileName = $derived(`${this.id || 'untitled'}.${this.extForKind(this.kind)}`);
    dirty = $derived(this.content !== this.loadedContent);
    readonly = $derived(this.busy || this.loading);
    charCount = $derived(this.content.length);
    lineCount = $derived(this.content.length === 0 ? 1 : this.content.split('\n').length);
    errorCount = $derived(this.issues.filter((i) => i.severity === 'error').length);
    warningCount = $derived(this.issues.filter((i) => i.severity === 'warning').length);

    private extForKind(k: EditorKind): string {
        return k === 'markdown' ? 'md' : k === 'json' ? 'json' : 'js';
    }

    private fingerprint(p: RouteParams): string {
        return `${p.kind}::${p.id}::${p.content ? 1 : 0}`;
    }

    /**
     * 由路由页面调用。身份指纹不变 → 直接复用当前 store，不重新加载。
     * 仅同步参数字段（保持派生正确），内容与 loadedContent 原样保留。
     */
    async init(params: RouteParams) {
        const key = this.fingerprint(params);

        // 参数字段始终对齐（即便复用也要保证 kind 等派生正确）
        this.kind = params.kind;
        this.id = params.id;
        this.preferInlineContent = params.content ?? false;

        if (this.loadedKey === key && !this.loading) {
            // 指纹一致：复用内存内容，跳过加载
            return;
        }
        await this.load(key);
    }

    /**
     * 异步加载内容并返回内容格式 —— 留空业务实现。
     * 这里给出可独立运行的 mock，真实项目替换 loadFromSource。
     */
    async load(key?: string) {
        this.loading = true;
        this.lastError = null;
        try {
            const result = await this.loadFromSource();
            this.kind = result.kind;
            this.content = result.content;
            this.loadedContent = result.content;
            this.issues = [];
            this.loadedKey = key ?? this.fingerprint({
                kind: this.kind,
                id: this.id,
                content: this.preferInlineContent
            });
        } catch (e) {
            this.lastError = e instanceof Error ? e.message : String(e);
        } finally {
            this.loading = false;
        }
    }

    // ────────────────────────────────────────────────────────────
    //  以下三个为「异步业务钩子」—— 按你的要求留空，仅演示锁定/解锁语义
    // ────────────────────────────────────────────────────────────

    /** 保存（异步）—— 执行期间 readonly=true，内容区不可操作 */
    async save() {
        if (this.busy) return;
        this.busy = true;
        this.busyAction = 'save';
        try {
            // TODO: 在此调用真实保存逻辑（如 window.electronAPI.saveFile）
            await this.mockAsync();
            this.loadedContent = this.content; // 保存成功后基线对齐
        } finally {
            this.busy = false;
            this.busyAction = null;
        }
    }

    /** 重新加载（异步）—— 强制覆盖当前编辑内容（忽略指纹缓存） */
    async reload() {
        if (this.busy) return;
        this.busy = true;
        this.busyAction = 'reload';
        try {
            // TODO: 在此调用真实重载逻辑
            await this.mockAsync();
            const result = await this.loadFromSource();
            this.kind = result.kind;
            this.content = result.content;
            this.loadedContent = result.content;
            this.issues = [];
            this.loadedKey = this.fingerprint({
                kind: this.kind,
                id: this.id,
                content: this.preferInlineContent
            });
        } finally {
            this.busy = false;
            this.busyAction = null;
        }
    }

    /** 校验（异步）—— 结果写入 issues */
    async validate() {
        if (this.busy) return;
        this.busy = true;
        this.busyAction = 'validate';
        try {
            // TODO: 在此调用真实校验逻辑（可结合 monaco marker）
            await this.mockAsync();
            this.issues = []; // 真实实现回填 ValidationIssue[]
        } finally {
            this.busy = false;
            this.busyAction = null;
        }
    }

    // ── 编辑区常用功能（由我实现，非留空）──

    private _editor: monaco.editor.IStandaloneCodeEditor | null = null;
    attachEditor(ed: monaco.editor.IStandaloneCodeEditor) {
        this._editor = ed;
    }
    detachEditor(ed?: monaco.editor.IStandaloneCodeEditor) {
        if (!ed || this._editor === ed) this._editor = null;
    }
    /** 聚焦后延一帧执行：确保焦点事件已派发到 Monaco 焦点跟踪器，
     *  否则 Quick Input 类动作（命令面板/查找/跳转行）会因无 active editor 报错。 */
    private runFocused(fn: (ed: monaco.editor.IStandaloneCodeEditor) => void) {
        const ed = this._editor;
        if (!ed) return;
        ed.focus();
        requestAnimationFrame(() => {
            // 延迟期间实例可能已被销毁/替换，重新取当前实例并校验
            const cur = this._editor;
            if (!cur || cur !== ed) return;
            fn(cur);
        });
    }
    undo() {
        this.runFocused((ed) => ed.trigger('toolbar', 'undo', null));
    }
    redo() {
        this.runFocused((ed) => ed.trigger('toolbar', 'redo', null));
    }
    format() {
        this.runFocused((ed) => ed.getAction('editor.action.formatDocument')?.run());
    }
    find() {
        this.runFocused((ed) => ed.getAction('actions.find')?.run());
    }
    commandPalette() {
        this.runFocused((ed) => ed.getAction('editor.action.quickCommand')?.run());
    }
    toggleWordWrap() {
        this.wordWrap = !this.wordWrap;
    }
    toggleMinimap() {
        this.minimap = !this.minimap;
    }

    setCursor(line: number, column: number, selLen: number) {
        this.cursorLine = line;
        this.cursorColumn = column;
        this.selectionLength = selLen;
    }

    private mockAsync(ms = 900) {
        return new Promise((r) => setTimeout(r, ms));
    }

    /** mock 数据源 —— 组件契约要求：脱离外部依赖也能完整渲染 */
    private async loadFromSource(): Promise<LoadResult> {
        await this.mockAsync(650);
        const samples: Record<EditorKind, string> = {
            markdown: `# ${this.id || 'Untitled'} 文档\n\n> 由 Monaco 编辑器驱动，继承 VSCode 内核体验。\n\n## 任务清单\n\n- [x] 集成 Monaco Editor 内核\n- [x] 主题跟随 shadcn 令牌\n- [ ] 接入本地文件树\n\n\`\`\`js\nconsole.log("Hello from Markdown code block");\n\`\`\`\n`,
            json: JSON.stringify(
                {
                    name: this.id || 'sample-config',
                    version: '1.0.0',
                    features: { autosave: true, minimap: true, wordWrap: 'on' },
                    tags: ['electron', 'monaco', 'shadcn']
                },
                null,
                2
            ),
            js: `// ${this.id || 'script'}.js — 内建代码提示演示\n// 输入 "app." 或 "db." 触发下方写死的补全项\n\nconst result = app.\n\ndb.query("SELECT * FROM users");\n`
        };
        return { kind: this.kind, content: samples[this.kind] };
    }
}

/** ── 全局唯一实例：所有子组件共用 ── */
export const editorStore = new EditorStore();

/**
 * 客户端写死的 JS 代码提示器 —— 供 MonacoEditor 注册。
 */
export const JS_COMPLETIONS: {
    label: string;
    insertText: string;
    detail: string;
    documentation: string;
}[] = [
        {
            label: 'app.navigate',
            insertText: 'app.navigate("${1:/path}")',
            detail: '(method) app.navigate(path: string): void',
            documentation: '跳转到指定路由路径。'
        },
        {
            label: 'app.toast',
            insertText: 'app.toast("${1:message}")',
            detail: '(method) app.toast(message: string): void',
            documentation: '弹出一条全局提示消息。'
        },
        {
            label: 'app.getUser',
            insertText: 'app.getUser()',
            detail: '(method) app.getUser(): User',
            documentation: '获取当前登录用户对象。'
        },
        {
            label: 'db.query',
            insertText: 'db.query("${1:SQL}")',
            detail: '(method) db.query(sql: string): Promise<Row[]>',
            documentation: '执行一条 SQL 查询并返回结果集。'
        },
        {
            label: 'db.insert',
            insertText: 'db.insert("${1:table}", ${2:record})',
            detail: '(method) db.insert(table: string, record: object): Promise<void>',
            documentation: '向指定表插入一条记录。'
        },
        {
            label: 'util.formatDate',
            insertText: 'util.formatDate(${1:date}, "${2:YYYY-MM-DD}")',
            detail: '(method) util.formatDate(date: Date, fmt: string): string',
            documentation: '格式化日期为指定字符串。'
        },
        {
            label: 'util.uuid',
            insertText: 'util.uuid()',
            detail: '(method) util.uuid(): string',
            documentation: '生成一个随机 UUID。'
        }
    ];