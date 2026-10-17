import type { IRunnerContext } from "$types/blueprint/context.js";
import type { Tool } from "ai";
import type { z } from "zod";

/** 宽松的 JSON 值(front matter 解析结果) */
export type JsonValue =
    | string | number | boolean | null
    | JsonValue[] | { [k: string]: JsonValue };

/**
 * 工具引用。front matter 的 tools 数组中每一项对应一个 ToolRef。
 * - builtin / mcp: 编译期即可拿到 Tool 实例(与 ctx 无关)
 * - agent: 编译期递归编译出 CompiledPacAgent,运行期再用 ctx 物化为 Tool
 */
export type ToolOrigin = "builtin" | "search" | "mcp" | "agent";

/** front matter 中的工具声明 */
export type PacToolConfig =
    | { type: "builtin"; id: string; alias?: string }
    | { type: "search"; query: string; limit?: number }
    | { type: "agent"; path: string; alias?: string }
    | { type: "mcp"; serverId: string; name: string; alias?: string };

/** 解析后的工具引用(编译期产物) */
export interface ToolRef {
    /** 最终暴露给 LLM 的工具键名,已保证唯一 */
    key: string;
    origin: ToolOrigin;
    /** builtin/search/mcp: 已实例化的工具;agent: null */
    tool: Tool | null;
    /** type==='agent' 时指向递归编译出的子 agent */
    agent: CompiledPacAgent | null;
    /** 声明来源,用于报错时回溯 */
    declaredAs: PacToolConfig;
}

/**
 * PAC front matter。所有字段可选。
 *
 * inputs / outputs 采用标准 JSON Schema(draft-07 / 2020-12),
 * 编译期通过 z.fromJSONSchema() 转成 zod,直接作为 Tool 的 inputSchema / outputSchema。
 */
export interface PacFrontMatter {
    /** Agent 名。缺省取文件名 */
    name?: string;
    /** 作为 Tool 时的 description(面向 LLM,必填才有意义) */
    description?: string;
    /** 输入 JSON Schema */
    inputs?: Record<string, unknown>;
    /** 输出 JSON Schema */
    outputs?: Record<string, unknown>;
    /** 工具声明 */
    tools?: PacToolConfig[];
    /** 最大执行步数,默认 10 */
    maxSteps?: number;
    /** 用户 prompt 模板。缺省:ctx.cmd.body → 序列化 inputs */
    userTemplate?: string;
    /** _F_ 变量的默认值声明表(仅用于编译期校验是否声明) */
    vars?: Record<string, JsonValue>;
    /** 透传给模板的其它元数据(可被 {{this.x}} 或 {{config.x}} 访问) */
    [key: string]: unknown;
}

/**
 * 编译后的 PAC Agent:纯数据,与 ctx 无关。构成一棵递归树。
 */
export interface CompiledPacAgent {
    name: string;
    description: string;
    config: PacFrontMatter;

    /** 正文(Handlebars 模板)。若未使用 {{_BI_tool}} 已被追加工具目录 */
    systemTemplate: string;
    /** 可选的用户 prompt 模板 */
    userTemplate?: string;

    /** 由 inputs 转换而来 */
    inputSchema: z.ZodObject<z.ZodRawShape>;
    /** 由 outputs 转换而来;未声明时为 null */
    outputSchema: z.ZodObject<z.ZodRawShape> | null;

    /** 全部工具引用(含子 agent),运行期据此物化 ToolSet */
    toolRefs: ToolRef[];

    /** 工具目录(markdown),即 {{_BI_tool}} 的取值 */
    toolDoc: string;

    /** 正文中检测到的变量,已按来源分桶 */
    vars: VarBuckets;

    /** 自身所在目录 */
    basePath: string;
    /** PAC 根目录(pac/index.md 所在目录),所有 agent:path 均以此为基准 */
    rootPath: string;
    /** 源文件绝对路径 */
    sourcePath: string;
}

/** 模板变量按来源分桶的结果 */
export interface VarBuckets {
    /** {{_BI_*}} 内置变量,如 _BI_tool */
    bi: string[];
    /** {{_T_*}} 内部存储变量,由运行期 loadStorageVars 提供 */
    storage: string[];
    /** {{_F_*}} front matter 变量,编译期即可求值 */
    frontMatter: string[];
    /** 无法识别来源的变量(不给值,渲染时为空串) */
    unknown: string[];
    /** 上述全部,保序去重 */
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