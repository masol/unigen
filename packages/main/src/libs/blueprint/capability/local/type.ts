import type { ToolMeta } from "$libs/tooldb/index.js";
import type { McpServerConfig } from "$libs/tooldb/type.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { Tool } from "ai";
import type { z } from "zod";

/** 宽松的 JSON 值(front matter 解析结果) */
export type JsonValue =
    | string | number | boolean | null
    | readonly JsonValue[] | { readonly [k: string]: JsonValue };

/**
 * 工具引用来源。
 * - builtin / search / mcp_global: 全局工具库(tooldb)
 * - mcp_local: PAC 文件中声明的局部 MCP 连接
 * - agent: 子 agent
 * - skill: 技能工具(load_skill / read_skill_file)
 */
export type ToolOrigin = "builtin" | "search" | "mcp_global" | "mcp_local" | "agent" | "skill";

/** 局部 MCP 配置(仅本 agent 使用,编译期探测元数据,运行期重连) */
export interface LocalMcpConfig {
    transport: McpServerConfig["transport"];
    include?: string[];
    alias?: string;
}

/** local 内部构造的工具(目前仅技能工具) */
export interface LocalToolSpec {
    tool: Tool;
    description: string;
    inputSchema: z.ZodType;
}

/** front matter 中的工具声明 */
export type PacToolConfig =
    | { type: "builtin"; id: string; alias?: string }
    | { type: "search"; query: string; limit?: number }
    | { type: "agent"; path: string; alias?: string }
    | { type: "mcp"; server: string; tool: string; alias?: string }
    | { type: "mcp_local"; transport: McpServerConfig["transport"]; include?: string[]; alias?: string };

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

export interface SkillInfo {
    name: string;
    description: string;
    dir: string;
    entry: string;
}

/**
 * getSmartModel 选项(与 $libs/model 的签名对齐)。
 */
export interface ModelSelectOptions {
    requiredAbilities?: string[];
    preferVersion?: string;
    minScore?: number;
    modelPattern?: RegExp;
    exact?: { providerId: string; modelId: string };
    streamHoldTimeoutMs?: number;
    sort?: unknown;
    minInctx?: number;
}

/**
 * PAC 超时配置,对齐 AI SDK:
 *   - number: 简单的总超时(毫秒)
 *   - object: 细粒度控制
 *     - totalMs:      整个调用总时长
 *     - stepMs:       单个 agent 步骤
 *     - firstChunkMs: 首个有意义 chunk 的等待时长(仅 stream 生效)
 *     - chunkMs:      相邻 chunk 之间的最大间隔(仅 stream 生效)
 */
export type PacTimeoutConfig = number | {
    totalMs?: number;
    stepMs?: number;
    firstChunkMs?: number;
    chunkMs?: number;
};

/** 集中处理后的运行配置,所有开关都有默认值 */
export interface ResolvedSettings {
    /** 单个 agent 步数上限,默认 10 */
    maxSteps: number;
    /** 根 agent 是否流式输出(仅根生效),默认 true */
    streaming: boolean;
    /** 是否启用思考 providerOptions,默认 true;实际效果取决于底层模型 */
    thinking: boolean;
    /**
     * 历史消息策略:
     *   null : 全部历史(默认)
     *   0    : 禁用历史
     *   N>0  : 最多取最近 N 条
     */
    history: number | null;
    /** 本次调用的超时配置;undefined 表示使用 provider 默认 */
    timeout?: PacTimeoutConfig;
}

/**
 * PAC front matter。所有字段可选。
 *
 * 注意:**不要**加 `[key: string]: unknown` 索引签名,否则 TS 可能报
 *   "Duplicate index signature for type 'string'"
 * 多余字段由 gray-matter 原样放在 `Record<string, unknown>` 里,
 * 通过 stripReserved 投入模板上下文。
 */
export interface PacFrontMatter {
    name?: string;
    description?: string;
    /** 根 agent 不应声明 inputs(用户原始录入即为输入),编译期告警并忽略 */
    inputs?: Record<string, unknown>;
    /** 根 agent 不应声明 outputs(直接响应用户),编译期告警并忽略 */
    outputs?: Record<string, unknown>;
    tools?: PacToolConfig[];
    maxSteps?: number;
    /** 内联用户模板,与 userTemplatePath 二选一 */
    userTemplate?: string;
    /** 外部用户模板文件,解析规则同 agent path */
    userTemplatePath?: string;
    /** 技能目录(单个或集合),路径规则同 agent path */
    skills?: string[] | string;
    /** _T_ 变量默认值声明表 */
    setDefault?: Record<string, JsonValue>;

    /** 默认 true;false 关闭根流式 */
    streaming?: boolean;
    /** 默认 true;false 关闭思考 */
    thinking?: boolean;
    /** 默认全部;0 禁用历史;N>0 最多最近 N 条 */
    history?: number | null;
    /** 本次调用的超时配置,支持数字或细粒度对象;见 PacTimeoutConfig */
    timeout?: PacTimeoutConfig;
}

/**
 * 编译后的 PAC Agent:纯数据,与 ctx 无关。构成一棵递归树。
 */
export interface CompiledPacAgent {
    /**
     * 稳定 agent id,用于 HistoryStore 定位本 agent 的历史。
     * 一般是相对 rootPath 的源文件路径(去 .md 后缀,分隔符用 '/'),
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

    skills: SkillInfo[];
    skillDoc: string;

    vars: VarBuckets;
    ownDefaults: Readonly<Record<string, JsonValue>>;

    /** 集中处理后的运行配置,见 settings.ts */
    settings: ResolvedSettings;

    basePath: string;
    rootPath: string;
    sourcePath: string;
}

/** 模板变量按来源分桶的结果 */
export interface VarBuckets {
    bi: string[];
    storage: string[];
    unknown: string[];
    all: string[];
}

/** 编译期缓存:同一文件只编译一次 + 循环引用检测 */
export interface CompileCache {
    compiled: Map<string, CompiledPacAgent>;
    compiling: Set<string>;
    rootPath: string;
    /** 顶层调用首次定位到的入口文件(绝对路径),用于识别"根 agent" */
    rootEntry?: string;
}

/** Agent 运行时接口,与 BaseAgent 对齐 */
export interface IPacAgent {
    run(ctx: IRunnerContext): Promise<string>;
    getCompiled(): CompiledPacAgent;
}