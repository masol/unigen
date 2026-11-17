// file: type.ts
import type { GetSmartModelOptions } from "$libs/model/balancer/get-smart-model.js";
import type { IProjectContext } from "$libs/project/type.js";
import type { ToolMeta } from "$libs/tooldb/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type {
    JsonValue,
    PacFrontMatter,
    PacToolConfig,
} from "$types/blueprint/frontmatter.js";
import {
    PacTimeoutConfigSchema,
    ReasoningLevelSchema,
    ResolvedSettingsSchema,
    type PacTimeoutConfig,
    type ReasoningLevel,
    type ResolvedSettings,
} from "$types/blueprint/settings.js";
import type { McpServerConfig } from "$types/shared/mcp.js";
import type { Tool } from "ai";
import { z } from "zod";

/**
 * 设置相关的 schema 与类型真源位于 `$types/blueprint/settings.ts`；
 * 这里重导出，供 $libs 内部与既有调用方继续从 `local/type.js` 导入。
 */
export { PacTimeoutConfigSchema, ReasoningLevelSchema, ResolvedSettingsSchema };
export type { PacTimeoutConfig, ReasoningLevel, ResolvedSettings };

/**
 * front matter 相关的类型真源位于 `$types/blueprint/frontmatter.ts`；
 * 这里重导出，供 $libs 内部与既有调用方继续从 `local/type.js` 导入。
 */
    export type {
        JsonValue,
        PacFrontMatter,
        PacToolConfig
    } from "$types/blueprint/frontmatter.js";

/**
 * 工具引用来源。
 * - builtin / search: 全局工具库(tooldb)；若工具实际来自 MCP，由 tooldb 隔离，agent 侧不区分
 * - mcp_local: PAC 文件中声明的局部 MCP 连接
 * - agent: 子 agent
 *
 * mcp_global 仅为兼容旧 trace 编码保留；新配置不再产生该来源，
 * 全局 MCP 工具统一通过 builtin 的全局 id 引用。
 *
 * 注:技能能力不再作为编译期一等公民,统一走 tool 接口(builtin / mcp 等)。
 */
export type ToolOrigin = "builtin" | "search" | "mcp_global" | "mcp_local" | "agent";

/** 局部 MCP 配置(仅本 agent 使用,编译期探测元数据,运行期重连) */
export interface LocalMcpConfig {
    transport: McpServerConfig["transport"];
    include?: string[];
    alias?: string;
}

/**
 * 编译期构造的工具描述。
 * - `tool`: 编译期可完全确定、运行时无外部依赖的工具
 * - `build`: 需要运行期上下文(如 prj)才能完成的工具工厂；由 materializeTools 调用
 */
export interface LocalToolSpec {
    tool?: Tool;
    build?: (prj: IProjectContext) => Tool;
    description: string;
    inputSchema: z.ZodType;
}

/** 局部 MCP 工具的编译期元数据 */
export interface LocalMcpToolInfo {
    name: string;
    description: string;
    inputSchema?: unknown;
}

/** 解析后的工具引用(编译期产物) */
export interface ToolRef {
    key: string;
    origin: ToolOrigin;
    meta: ToolMeta | null;
    agent: CompiledPacAgent | null;
    local?: LocalToolSpec | null;
    mcpLocal?: {
        config: LocalMcpConfig;
        tool: LocalMcpToolInfo;
    };
    declaredAs?: PacToolConfig;
}

/**
 * 模型选择选项直接复用 model balancer 的公开类型，避免两处定义漂移。
 *
 * 保留 ModelSelectOptions 别名以降低现有调用点的影响面；
 * 新代码应优先使用 GetSmartModelOptions。
 */
export type { GetSmartModelOptions };
export type ModelSelectOptions = GetSmartModelOptions;

/**
 * 编译后的 PAC Agent:纯数据,与 ctx 无关。构成一棵递归树。
 */
export interface CompiledPacAgent {
    /**
     * 稳定 agent id,用于 HistoryStore 定位本 agent 的历史。
     * 一般是相对 rootBase 的源文件路径(去 .md 后缀,分隔符用 '/'),
     * 例如 "index"、"sub/foo"。passthrough 使用 "__passthrough__/<prjType>"。
     */
    id: string;
    name: string;
    description: string;
    /** true 表示源文件缺失时构造的直通 agent */
    passthrough: boolean;

    config: PacFrontMatter;

    systemTemplate: string;
    userTemplate: string;

    inputSchema: z.ZodObject<z.ZodRawShape>;
    outputSchema: z.ZodObject<z.ZodRawShape> | null;

    toolRefs: ToolRef[];
    toolDoc: string;

    vars: VarBuckets;
    ownDefaults: Readonly<Record<string, JsonValue>>;

    /** 集中处理后的运行配置,见 settings.ts */
    settings: ResolvedSettings;

    /** 当前 agent 源文件所在目录相对项目根的分段路径 */
    base: string[];
    /** PAC 根目录相对项目根的分段路径 */
    rootBase: string[];
    sourcePath: string;
}

/** 模板变量按来源分桶的结果 */
export interface VarBuckets {
    bi: string[];
    storage: string[];
    unknown: string[];
    all: string[];
}

/**
 * 编译期缓存:同一文件只编译一次 + 循环引用检测。
 *
 * **不缓存 prj**：prj 通过编译期参数逐层显式传入，运行期一律用 ctx.prj。
 */
export interface CompileCache {
    compiled: Map<string, CompiledPacAgent>;
    compiling: Set<string>;
    /** PAC 根目录相对项目根的分段路径 */
    rootBase: string[];
    /** 顶层入口文件相对项目根的分段路径，用于识别"根 agent" */
    rootEntry?: string[];
}

/** Agent 运行时接口,与 BaseAgent 对齐 */
export interface IPacAgent {
    run(ctx: IRunnerContext): Promise<string>;
    getCompiled(): CompiledPacAgent;
    /**
     * 返回当前 agent 树中所有 front matter.requireModel 的去重数组。
     * 顺序为：根 agent 优先，然后按 toolRefs 深度优先顺序。
     */
    getRequireModels(): string[];
}