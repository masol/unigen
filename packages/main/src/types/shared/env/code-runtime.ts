// packages/main/src/types/shared/env/code-runtime.ts
//
// 代码运行时 / 本机工具的共享类型定义。
//
// 这里的类型**同时被主进程与渲染进程引用**，因此必须保持对 Node 内置 API
// 与主进程专用的工具函数的零依赖；唯一允许的对外协作方式是"纯数据 + 类型"。
//
// 修改此文件时，请同步检查：
//   - `libs/coderuntime/manager.ts`：状态机与持久化读写；
//   - `libs/store/stable.schema.ts`：持久化 schema；
//   - `libs/coderuntime/engines/*.ts`：引擎实现的返回类型；
//   - `api/common/code.cfg.ts` / `api/common/code.ts`：renderer 侧接口。

/**
 * 代码运行时 / 本机工具引擎标识。
 *
 * 命名沿用历史叫法「CodeRuntime」，实际语义是 **本机运行时 / 工具**：
 * 既包含语言运行时（Python / Node.js），也包含可复用的命令行工具
 * （如 aria2 这类下载工具）。它们共享同一套安装 / 验证 / 工具注册流程。
 *
 * 新增引擎时：
 *   1. 扩充本联合类型；
 *   2. 同步 `stable.schema.ts` 中 `codeRuntime.engines` 与
 *      `codeRuntimeStatus.engines` 的 schema 键；
 *   3. 在 `engines/` 下提供 `EngineRuntimeHandler` 实现（并在
 *      `engines/index.js` 的 `ENGINE_CLASSES` / `KNOWN_ENGINE_IDS` 里登记）；
 *   4. 在 `tools/` 下提供对应工具（由 `CodeRuntimeManager` 自动注册 / 注销）；
 *   5. 同步 `api/common/code.cfg.ts` 的 `RUNTIME_IDS / CODE_RUNTIME_IDS /
 *      RUNTIME_INFO`，让 renderer 侧的设置页可见可控。
 */
export type CodeRuntimeEngineId = "python" | "nodejs" | "aria2";

/**
 * 引擎在磁盘上的状态机。
 *
 * - `not_ready`   ：尚未安装 / 需要重装；
 * - `installing`  ：安装进行中（**持久化**，使进程异常退出的情况可被感知）；
 * - `ready`       ：最近一次安装 / 验证成功；
 * - `failed`      ：上一次安装 / 验证失败（保留 `phase` / `message` / `progress` 供 UI 定位）；
 * - `interrupted` ：进程在安装过程中退出，重启后视为"历史残留"，
 *                   由 `CodeRuntimeManager.init` 收敛为 `interrupted`。
 */
export type CodeRuntimeEngineState =
    | "not_ready"
    | "installing"
    | "ready"
    | "failed"
    | "interrupted";

/** 单个引擎的用户配置（可备份 / 恢复）。 */
export interface CodeRuntimeEngineConfig {
    /** 是否启用；关闭时不会下载 / 更新，不会注册对应工具。 */
    enabled: boolean;
    /** 期望版本号；仅展示用途，实际以归档为准。 */
    version?: string;
    /**
     * 自定义归档下载 URL。
     *
     * - 缺省时由引擎实现按平台给出默认值（中国区自动切换国内镜像）；
     * - 提供时优先于引擎默认（**单源**，不再做镜像探测）。
     *
     * 支持 `.zip` / `.tar` / `.tar.gz` / `.tgz`；各引擎会按自身官方
     * 发布的格式约定选择（例如 aria2 只使用官方 zip、Node.js 在
     * Windows 用 zip、其他平台用 tar.gz）。
     */
    archiveUrl?: string;
    /** 归档 SHA256（hex）。提供则下载后校验，缺失则跳过。 */
    archiveSha256?: string;
    /**
     * 解压后需要剥离的路径前缀，例如 `node-v20.17.0-win-x64/`。
     * 起始前缀，不允许中间段；末尾斜杠可省。
     */
    extractStripPrefix?: string;
    /** 入口可执行文件相对运行时根的路径，例如 `python.exe`。 */
    executableRelativePath?: string;
    /**
     * pip / npm 等包管理器的额外源配置；缺省使用内置默认（中国区自动注入镜像）。
     * 不使用包管理器的工具类引擎（如 aria2）忽略此字段。
     */
    registry?: string;
}

/** 代码运行时 / 本机工具总配置。 */
export interface CodeRuntimeConfig {
    /** 总开关；关闭时所有引擎均不生效，默认关闭。 */
    enabled: boolean;
    /** 按引擎分项配置。 */
    engines: Record<CodeRuntimeEngineId, CodeRuntimeEngineConfig>;
}

/**
 * 单个引擎的持久化状态。
 *
 * **持久化意图**：即使安装中途进程退出，历史进度与失败原因仍可回查；
 * 重启后由 `CodeRuntimeManager.init` 决定是否复用 / 重装。
 */
export interface CodeRuntimeEngineStatus {
    state: CodeRuntimeEngineState;
    /**
     * 最近一次运行时的根目录（可能无效，`assertReady` 会校验）。
     *
     * 两种来源：
     *   - 托管安装：`<userData>/runtime/code/<engineId>/`；
     *   - 系统已安装的运行时（如 Linux / macOS 的 aria2c）：可执行文件
     *     所在目录（例如 `/usr/bin`）。`assertReady` 会用它拼出入口路径，
     *     因此这里必须始终是**可执行文件所在目录**，而不是安装包根目录。
     */
    installedRoot?: string;
    /** 最近一次失败 / 中断的简短错误面（详情见 message）。 */
    lastError?: string;
    /** 最近一次状态变更的毫秒时间戳。 */
    lastCheckAt?: number;
    /** 失败 / 中断时处于的阶段名（如 `downloading` / `extracting`）。 */
    phase?: string;
    /** 失败 / 中断时的可视消息。 */
    message?: string;
    /** 失败 / 中断时的进度（0~100）。 */
    progress?: number;
    /** 最近一次成功验证的版本描述（来自引擎 `--version` 输出）。 */
    verifiedVersion?: string;
}

/** 状态快照聚合。用于持久化与跨重启恢复。 */
export interface CodeRuntimeStatus {
    engines: Partial<Record<CodeRuntimeEngineId, CodeRuntimeEngineStatus>>;
    /** 状态最近一次整体更新时间（毫秒时间戳）。 */
    updatedAt: number;
}

/**
 * npm registry 测速缓存。
 *
 * 目的：中国区首次使用 npm 时按需测速一次并**持久化 7 天**，
 * 期间直接复用缓存值，避免每次启动 / 每次 install 都重新测速
 * （当前版本的"进程内 30 分钟"缓存会被冷启动反复击穿）。
 *
 * 失效条件（任一）：
 *   - `checkedAt === 0`：被手动失效（如 install 失败，见 nodejs.ts）；
 *   - `Date.now() - checkedAt >= 7d`：超过 TTL；
 *   - `cache.isChina !== stableConfig.isChina`：区域发生变化。
 *
 * 仅在中国区使用；非中国区固定走官方源，不读取此缓存。
 */
export interface NpmRegistryCache {
    /** 选中的 registry URL。 */
    url: string;
    /** 选中时间戳（ms）；0 表示已失效。 */
    checkedAt: number;
    /** 选中时的 isChina 状态，用于区域变化时自动失效。 */
    isChina: boolean;
}