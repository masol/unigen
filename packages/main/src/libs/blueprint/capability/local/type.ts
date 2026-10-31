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

/**
 * 局部 MCP 配置(仅本 agent 使用,编译期探测元数据,运行期重连)。
 */
export interface LocalMcpConfig {
    transport: McpServerConfig["transport"];
    /** 只加载这些工具;不传则加载全部 */
    include?: string[];
    /** 给工具名加前缀,避免冲突 */
    alias?: string;
}

/**
 * local 内部构造的工具(目前仅技能工具)。
 */
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
    | { type: "mcp"; server: string; tool: string; alias?: string }  // 全局 MCP
    | { type: "mcp_local"; transport: McpServerConfig["transport"]; include?: string[]; alias?: string };  // 局部 MCP

/** 局部 MCP 工具的编译期元数据 */
export interface LocalMcpToolInfo {
    name: string;
    description: string;
    /** 探测成功时为 AI SDK schema 包装;探测失败时为 undefined */
    inputSchema?: unknown;
}

/** 解析后的工具引用(编译期产物) */
export interface ToolRef {
    /** 最终暴露给 LLM 的工具键名,已保证唯一 */
    key: string;
    origin: ToolOrigin;
    meta: ToolMeta | null;
    agent: CompiledPacAgent | null;
    local?: LocalToolSpec | null;
    /** 局部 MCP:编译期缓存元数据,运行期按 config 重连(每个 ref 对应一个工具) */
    mcpLocal?: {
        config: LocalMcpConfig;
        tool: LocalMcpToolInfo;
    };
    /** 技能工具无声明来源 */
    declaredAs?: PacToolConfig;
}

export interface SkillInfo {
    name: string;
    description: string;
    /** 技能目录绝对路径 */
    dir: string;
    /** SKILL.md 绝对路径 */
    entry: string;
}

/**
 * PAC front matter。所有字段可选。
 */
export interface PacFrontMatter {
    name?: string;
    description?: string;
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    tools?: PacToolConfig[];
    maxSteps?: number;
    /** 内联用户模板,与 userTemplatePath 二选一 */
    userTemplate?: string;
    /** 外部用户模板文件,解析规则同 agent path */
    userTemplatePath?: string;
    /** 技能目录(单个技能目录或技能集合目录),路径规则同 agent path */
    skills?: string[] | string;
    /** _T_ 变量默认值声明表 */
    setDefault?: Record<string, JsonValue>;
    [key: string]: unknown;
}

/**
 * 编译后的 PAC Agent:纯数据,与 ctx 无关。构成一棵递归树。
 */
export interface CompiledPacAgent {
    name: string;
    description: string;
    config: PacFrontMatter;

    /** 系统提示词(Handlebars 模板)。若未使用 {{_BI_tool}},编译期已追加其引用 */
    systemTemplate: string;
    /**
     * 用户提示词(Handlebars 模板)。
     * 编译期已固化:userTemplate > userTemplatePath 文件正文 > 默认 "{{_BI_input}}"。
     */
    userTemplate: string;

    /** 由 inputs 转换而来 */
    inputSchema: z.ZodObject<z.ZodRawShape>;
    /** 由 outputs 转换而来;未声明时为 null */
    outputSchema: z.ZodObject<z.ZodRawShape> | null;

    /** 全部工具引用(含子 agent、局部 MCP、技能),运行期据此物化 ToolSet */
    toolRefs: ToolRef[];

    /** 工具目录(markdown),即 {{_BI_tool}} 的取值 */
    toolDoc: string;

    /** 技能清单(编译期发现的所有技能) */
    skills: SkillInfo[];
    /** 技能清单(markdown),即 {{_BI_skill}} 的取值 */
    skillDoc: string;

    /** 系统+用户两份模板合并扫描到的变量,已按来源分桶 */
    vars: VarBuckets;

    /**
     * 本 agent 的 _T_ 变量默认值(来自 setDefault),编译期固化。
     * 运行期与 inheritedDefaults 合并:
     *   effectiveDefaults = { ...inheritedDefaults, ...ownDefaults }
     * 然后作为 loadStorageVars 的 defaults 参数。
     */
    ownDefaults: Readonly<Record<string, JsonValue>>;

    /** 自身所在目录 */
    basePath: string;
    /** PAC 根目录(pac/index.md 所在目录),所有相对路径均以此为基准 */
    rootPath: string;
    /** 源文件绝对路径 */
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
}

/** Agent 运行时接口,与 BaseAgent 对齐 */
export interface IPacAgent {
    run(ctx: IRunnerContext): Promise<string>;
    getCompiled(): CompiledPacAgent;
}