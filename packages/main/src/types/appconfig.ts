import type { RecentProject } from "./shared/api/recents.js";
import type { McpServerConfig } from "./shared/mcp.js";
import type { Provider } from "./shared/model.js";


/**
 * Markdown 正文可用字体族集合。
 * 具体字体栈由 renderer 侧映射，此处仅存语义键，便于将来切换/扩展。
 */
export type MarkdownFontFamily = "system" | "sans" | "serif";

export interface AppConfig {
    theme: 'light' | 'dark' | 'system';
    lang: string;
    maximized: boolean;
    // model_endpoint: string; // 模型的下载点。(包括ugvector下载embeding以及ollmacpp自动下载模型)
    embed_model: string; // ugvector使用的模型名称(external:XXX为外部模型，非本地模型)
    rerank_model: string; // 废弃使用本地LLM模型(可以通过llama-cpp或LM Studio等本地桥接)，本字段改为rerank配置。
    task_dir: string; // 任务存储目录，默认是用户应用目录下的user_tasks
    autoupdate: boolean;
    parallelRun: boolean;
    models: Provider[];
    mcpServers: McpServerConfig[];
    concurrency: number;
    telemetry: string; // COLLECTOR_URL配置。
    disableHA: boolean; // 禁用硬件加速。 disableHardwareAcceleration 
    itemsPerPage: number;
    fontSize: number;
    lineHeight: number;
    lineNumbers: boolean;
    rmblueprint: boolean; // 是否允许删除blueprint三表中的成员，默认false.
    showDevUI: boolean; // 是否显示开发用界面.
    keybindings: Record<string, string[]>;
    // 其他配置...

    // ── Markdown 阅读外观 ─────────────────────────────────────
    /** Markdown 正文字号，单位 px */
    markdownFontSize: number;
    /** Markdown 正文行高倍数（无单位），推荐 1.5 ~ 2.0 */
    markdownLineHeight: number;
    /** Markdown 正文字体族，见 MarkdownFontFamily */
    markdownFontFamily: MarkdownFontFamily;
    /** 代码块字号，单位 px */
    markdownCodeFontSize: number;
    /** 单条消息的最大阅读宽度（px），0 表示跟随容器 */
    markdownMaxWidth: number;
    /** 代码行数超过该阈值时默认折叠；0 表示不自动折叠 */
    markdownAutoCollapseCode: number;
}

// ── 代码运行时 ─────────────────────────────────────────────
//
// 设计目标：让 AI 在隔离、可控的独立运行时中执行代码（执行 / 编译 / 依赖安装），
// 与主进程 Electron 内置 Node 隔离，避免污染宿主环境。
//
// - 每个引擎拥有独立的 download/extract/verify 生命周期；
// - 用户配置（用户意图、可备份恢复）持久化在 StableConfig；
// - 运行时状态（installing / ready / failed / lastError）为**瞬时**数据，
//   由 `CodeRuntimeManager` 在内存中维护；重启后由「磁盘存在性」自我修复。
// - 未来扩展语言时，仅需：
//     1. 扩展 `CodeRuntimeEngineId`；
//     2. 在 stableSchema 中补充对应键；
//     3. 实现 `engines/<id>.ts`；
//     4. 在 `tools/` 中提供工具定义。

/**
 * 代码运行时引擎标识。
 */
export type CodeRuntimeEngineId = "python" | "nodejs";

/**
 * 引擎在磁盘上的状态机。
 * **仅内存**，不做持久化（避免崩溃后残留 installing 状态）。
 */
export type CodeRuntimeEngineState =
    | "not_ready"
    | "installing"
    | "ready"
    | "failed";

/** 单个运行时的用户配置（可备份恢复）。 */
export interface CodeRuntimeEngineConfig {
    /** 是否启用该引擎；关闭时不会下载/更新，也不会注册对应工具。 */
    enabled: boolean;
    /** 期望版本号，仅展示用途；实际以 archiveUrl 指向的归档为准。 */
    version?: string;
    /**
     * 自定义下载归档的 URL。
     * 缺省时由引擎实现按平台给出默认值（中国区会自动切换国内镜像）。
     *
     * 支持 `.zip` / `.tar` / `.tar.gz` / `.tgz`；由 `loader/archive.ts` 自动分发。
     */
    archiveUrl?: string;
    /** 归档 SHA256（hex）。提供后下载完成后会校验，缺失则跳过校验。 */
    archiveSha256?: string;
    /**
     * 归档解压后需要剥离的路径前缀，例如 "node-v20.17.0-win-x64/"。
     * 留空表示 root 目录即运行时根目录。末尾斜杠可选，内部会做规范化处理。
     *
     * zip 侧按字符串前缀严格剥离；tar 侧换算为层级数（`strip` 参数）。
     * 因此请传入**起始**段（例如 `node-v20.17.0-win-x64/`），不要传中间段。
     */
    extractStripPrefix?: string;
    /**
     * 入口可执行文件相对于运行时根的路径，例如 "python.exe"。
     * 留空时由引擎实现给出平台默认值。
     */
    executableRelativePath?: string;
    /** pip / npm 额外源配置；留空使用官方默认（中国区自动注入国内镜像）。 */
    registry?: string;
}

/** 代码执行运行时总配置。 */
export interface CodeRuntimeConfig {
    /** 总开关；关闭时所有引擎均不生效。默认关闭。 */
    enabled: boolean;
    /** 按引擎分项配置。 */
    engines: Record<CodeRuntimeEngineId, CodeRuntimeEngineConfig>;
}

// ── 运行时状态（仅内存类型，不进入持久化 store） ─────────────

export interface CodeRuntimeEngineStatus {
    state: CodeRuntimeEngineState;
    installedRoot?: string;
    lastError?: string;
    lastCheckAt?: number;
}

// ── StableConfig ────────────────────────────────────────────

/**
 * 低频变化、无需频繁修改的持久化配置/缓存。
 *
 * 注意：这里的数据变化缓慢，读写频率远低于 secondConfig；
 * 任何「高频 UI 状态」「瞬时状态」「崩溃后应重置」的数据都不应放在这里。
 */
export interface StableConfig {
    /**
     * 当前是否中国区。
     * 扁平化保存，调用方可直接 `stableConfig().get("isChina")`。
     * 默认 true，检测失败时也保守视为中国。
     */
    isChina: boolean;
    /**
     * 最近一次成功检测 isChina 的 Unix 毫秒时间戳。
     * 0 表示从未成功检测；用于实现 7 天缓存，不保存国家代码。
     */
    isChinaCheckedAt: number;
    /** 在项目级 lancedb 成功创建一次之后，被设置为 true。 */
    search_inited: boolean;
    /** 代码运行时配置（用户意图，可备份恢复）。 */
    codeRuntime: CodeRuntimeConfig;
}

// ── SecondConfig ────────────────────────────────────────────

/**
 * 高频、面向快速 UI 的持久化状态。
 *
 * 由 electron-store 自动持久化，仅保存最近项目等高频数据；
 * 低频配置/缓存请使用 StableConfig。
 */
export interface SecondConfig {
    recents: RecentProject[];
}