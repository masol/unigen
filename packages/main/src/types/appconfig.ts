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


// 无需备份与恢复的第二配置。
export interface SecondConfig {
    recents: RecentProject[],
    search_inited: boolean
}