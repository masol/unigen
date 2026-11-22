/**
 * 代码运行时环境 id。
 *
 * 与主进程 `CodeRuntimeEngineId` 保持同步；新增引擎时需要**同时**修改：
 *   - 本文件；
 *   - `packages/main/src/types/shared/env/code-runtime.ts`；
 *   - `packages/main/src/libs/coderuntime/engines/*.reg.ts` / engines / tools；
 *   - `packages/main/src/api/common/code.ts` 中的 `RUNTIME_IDS` 与 `RUNTIME_INFO`。
 */
export type CodeRuntimeId = 'python' | 'nodejs';

export type CodeRuntimeStatus = 'disabled' | 'preparing' | 'ready' | 'failed';

/** 环境类型：语言级 / 沙盒级。未来统一在此扩展即可。 */
export type CodeRuntimeKind = 'language' | 'sandbox';

/**
 * 由服务器提供、前端只读：
 *  - 环境清单不能硬编码在 UI，未来新增语言 / 沙盒只改后端；
 *  - 每个条目的文案（tagline / capability）都面向用户，不用内部术语；
 *  - `id` 使用 `CodeRuntimeId` 联合类型，使 `safeApi().code.setRuntimeEnabled`
 *    等接口的类型与 oRPC schema 严格对齐。
 */
export interface CodeRuntimeInfo {
    id: CodeRuntimeId;
    name: string;
    kind: CodeRuntimeKind;
    tagline: string;
    capability: string;
    icon?: string;
    approximateDownloadMB?: number;
    /** 就绪后点击"测试一下"运行的代码片段 */
    testSnippet: string;
}

/**
 * 环境的运行时状态（由服务器维护，UI 只读 + 通过 enable/disable 驱动）。
 *   - 不存在 `enabled` 字段：`status !== 'disabled'` 即表示用户已启用；
 *   - 状态机：disabled → preparing → ready | failed；
 *   - 从 ready/failed → disabled 由 setRuntimeEnabled 触发。
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

/** 页面一次性拉取的组合数据 */
export interface CodeRuntimeEntry {
    info: CodeRuntimeInfo;
    state: CodeRuntimeState;
}

/** "测试一下"按钮返回结果。 */
export interface CodeRuntimeTestResult {
    ok: boolean;
    output: string;
    elapsedMs: number;
    error?: string;
}