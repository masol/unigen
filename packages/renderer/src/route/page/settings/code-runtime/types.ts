export type CodeRuntimeStatus = 'disabled' | 'preparing' | 'ready' | 'failed';

/** 环境类型：语言级 / 沙盒级。未来统一在此扩展即可。 */
export type CodeRuntimeKind = 'language' | 'sandbox';

/**
 * 由服务器提供、前端只读：
 *  - 环境清单不能硬编码在 UI，未来新增语言 / 沙盒只改后端；
 *  - 每个条目的文案（tagline / capability）都面向用户，不用内部术语；
 */
export interface CodeRuntimeInfo {
    id: string;
    name: string;
    kind: CodeRuntimeKind;
    tagline: string;
    capability: string;
    /**
     * 暴露给模型的 language 枚举值（同一 `run_code` 工具共用）。
     * 沙盒可为空 —— 沙盒在工具侧走不同分支，不通过 language 区分。
     */
    language?: string;
    icon?: string;
    approximateDownloadMB?: number;
    /** 就绪后点击"测试一下"运行的代码片段 */
    testSnippet: string;
}

/**
 * 环境的运行时状态（由服务器维护，UI 只读 + 通过 enable/disable 驱动）。
 *   - 不存在 `enabled` 字段：`status !== 'disabled'` 即表示用户已启用；
 *   - 状态机：disabled → preparing → ready | failed；
 *   - 从 ready/failed → disabled 由 disableCodeRuntime 触发。
 */
export interface CodeRuntimeState {
    id: string;
    status: CodeRuntimeStatus;
    version?: string;
    /** preparing 阶段进度 0-100 */
    progress?: number;
    /** preparing 阶段展示的当前步骤描述 */
    message?: string;
    error?: string;
}

/** 服务器推送的事件 —— 完整 state 快照，前端直接替换，避免 merge 逻辑 */
export interface CodeRuntimeEvent {
    id: string;
    state: CodeRuntimeState;
}

export interface CodeRuntimeTestResult {
    ok: boolean;
    output: string;
    elapsedMs: number;
    error?: string;
}

/** 页面一次性拉取的组合数据 */
export interface CodeRuntimeEntry {
    info: CodeRuntimeInfo;
    state: CodeRuntimeState;
}