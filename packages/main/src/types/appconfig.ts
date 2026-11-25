// packages/main/src/types/appconfig.ts
import type { RecentProject } from "./shared/api/recents.js";
import type {
    CodeRuntimeConfig,
    CodeRuntimeStatus,
    NpmRegistryCache,
} from "./shared/env/code-runtime.js";
import type { McpServerConfig } from "./shared/mcp.js";
import type { Provider } from "./shared/model.js";

// 兼容旧 import：这里重新导出共享类型。
// 新增代码请优先从 `./shared/env/code-runtime.js` 导入。
export type {
    CodeRuntimeConfig,
    CodeRuntimeEngineConfig,
    CodeRuntimeEngineId,
    CodeRuntimeEngineState,
    CodeRuntimeEngineStatus,
    CodeRuntimeStatus,
    NpmRegistryCache
} from "./shared/env/code-runtime.js";

/**
 * Markdown 正文可用字体族集合。
 * 具体字体栈由 renderer 侧映射，此处仅存语义键，便于将来切换/扩展。
 */
export type MarkdownFontFamily = "system" | "sans" | "serif";

/**
 * 全文检索（FTS）分词策略。
 *
 * - jieba：中文分词，召回最好；语言模型目录缺失时自动回退到 icu；
 * - icu：ICU 分词，跨语言；中文效果通常弱于 jieba；
 * - simple：LanceDB 内置简单分词，主要用于排查与兼容。
 */
export type FtsTokenizer = "jieba" | "icu" | "simple";

export interface AppConfig {
    theme: 'light' | 'dark' | 'system';
    lang: string;
    maximized: boolean;
    // model_endpoint: string; // 模型的下载点。(包括ugvector下载embeding以及ollmacpp自动下载模型)
    embed_model: string; // ugvector使用的模型名称(external:XXX为外部模型，非本地模型)
    rerank_model: string; // 废弃使用本地LLM模型(可以通过llama-cpp或LM Studio等本地桥接)，本字段改为rerank配置。
    /** 全文检索分词策略；默认 jieba，模型缺失时自动回退到 icu。 */
    fts_tokenizer: FtsTokenizer;
    task_dir: string; // 任务存储目录，默认是用户应用目录下的user_tasks
    model_dir: string; // 保存模型的根目录，下载的模型，以及llama.cpp读取模型的地方--会有子目录。rerank/embeding等等以区分模型。
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

// ── StableConfig ────────────────────────────────────────────

/**
 * 低频变化、无需频繁修改的持久化配置/缓存。
 *
 * 注意：这里的数据变化缓慢，读写频率远低于 secondConfig；
 * 任何「高频 UI 状态」「瞬时状态」都不应放在这里。
 *
 * 代码运行时 / 本机工具部分包含：
 *   - `codeRuntime`       ：用户意图（各引擎独立启用 / 版本 / 归档 / 镜像 / registry 等）；
 *   - `codeRuntimeStatus` ：持久化的安装状态（含历史遗留进度）；
 *                          由 `CodeRuntimeManager` 维护；**进程重启后用于恢复**；
 *   - `npmRegistryCache`  ：中国区 npm registry 测速结果的持久化缓存
 *                          （7 天 TTL，见 `nodejs.ts` / `NpmRegistryCache`）。
 *
 * 注：`codeRuntime` / `codeRuntimeStatus` 同时容纳语言运行时（python / nodejs）
 * 与工具类运行时（aria2）；各引擎的 `registry` / `archiveUrl` 字段按引擎
 * 各取所需，例如 aria2 不使用 `registry`。
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
    /** 代码运行时 / 本机工具配置（用户意图，可备份恢复）。 */
    codeRuntime: CodeRuntimeConfig;
    /**
     * 代码运行时 / 本机工具状态（持久化）。
     *
     * 存在的意义：崩溃 / 断电 / 强杀进程后，下次启动仍能看到"上次安装到哪一步、
     * 失败原因是什么"，并让 `init` 决定是否重装；
     * 不做 `installing` 残留收敛会导致 UI 卡在"安装中"。
     */
    codeRuntimeStatus: CodeRuntimeStatus;
    /**
     * 中国区 npm registry 测速缓存。
     *
     * - 首次使用 / 缓存失效（TTL / 区域变化 / 手动失效）时触达测速；
     * - 成功结果写入此字段并复用 7 天；
     * - install 失败时由 `nodejs.ts` 置 `checkedAt = 0` 强制下次重测。
     *
     * 仅中国区使用；非中国区固定走官方源，不读取 / 不写入此字段。
     */
    npmRegistryCache?: NpmRegistryCache;
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