// packages/main/src/types/blueprint/frontmatter.ts

import type { McpServerConfig } from "$types/shared/mcp.js";
import type {
    PacTimeoutConfig,
    ReasoningLevel,
} from "./settings.js";

/** 宽松的 JSON 值(front matter 解析结果) */
export type JsonValue =
    | string | number | boolean | null
    | readonly JsonValue[] | { readonly [k: string]: JsonValue };

/**
 * front matter 中的工具声明。
 *
 * 全局 MCP 工具不再使用独立的 type: "mcp" 声明，
 * 统一通过 builtin + 全局工具 id 引用。
 */
export type PacToolConfig =
    | { type: "builtin"; id: string; alias?: string }
    | { type: "search"; query: string; limit?: number }
    | { type: "agent"; path: string; alias?: string }
    | { type: "mcp_local"; transport: McpServerConfig["transport"]; include?: string[]; alias?: string };

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
    /**
     * 期望模型描述。
     *
     * 客户端可通过 `ctx.settings.userSelModel` 传对象，以该字段为 key 选择 exact 模型；
     * 例如 requireModel: "fast"，settings.userSelModel = { fast: "openai::gpt-4.1-mini" }。
     */
    requireModel?: string;
    /**
     * 本 agent 的模型选择配置。
     *
     * 语义与 `resolveModelOptions` 中 `PrjDB.ensure(ctx.prj).get("model")` 的返回值一致：
     * - string：按 `modelPattern` 正则处理；
     * - object：作为模型选择选项透传。
     *
     * 当前仅作为 front matter 类型声明保留，运行期仍读取 PrjDB 的 "model"；
     * 后续可由 `resolveModelOptions` 优先消费该字段，以取代对 PrjDB 的读取。
     */
    model?: string | Record<string, unknown>;
    /** 根 agent 不应声明 inputs(用户原始录入即为输入),编译期告警并忽略 */
    inputs?: Record<string, unknown>;
    /** 根 agent 不应声明 outputs(直接响应用户),编译期告警并忽略 */
    outputs?: Record<string, unknown>;
    tools?: PacToolConfig[];
    /**
     * 本 agent 可用的本地技能名称列表。
     *
     * 运行期会转换为完整 id：`skill:${name}`，并从项目 LanceDB 的 skill 表读取。
     * 命中的技能会以 `load_locskill` 工具注入当前 agent。
     * 之所以不使用全局load_skill工具，是因为提示词有区别。但这带来潜在的重复加载相同tool的风险。
     */
    skills?: string[];
    /**
     * 本 agent 可用的本地知识库 id 列表。
     *
     * 运行期会从项目 LanceDB 的 kb_catalog 表读取名称/描述，
     * 并以 `query_lockc` 工具注入当前 agent。
     */
    knowledgeBases?: string[];
    maxSteps?: number;
    /** 内联用户模板,与 userTemplatePath 二选一 */
    userTemplate?: string;
    /** 外部用户模板文件,解析规则同 agent path */
    userTemplatePath?: string;
    /** _T_ 变量默认值声明表 */
    setDefault?: Record<string, JsonValue>;

    /** 默认 true;false 关闭根流式 */
    streaming?: boolean;
    /** 推理级别;默认 "provider-default" */
    reasoning?: ReasoningLevel;
    /** 默认 true;false 时不写 messages 表(仅 trace 仍然汇报) */
    persist?: boolean;
    /** 默认全部;0 禁用历史;N>0 最多最近 N 条 */
    history?: number | null;
    /** 本次调用的超时配置,支持数字或细粒度对象;见 PacTimeoutConfig */
    timeout?: PacTimeoutConfig;
    /** 采样温度,建议 0~2 */
    temperature?: number;
    /** 输出 token 上限 */
    maxOutputTokens?: number;
    /** 工具调用并发上限 */
    toolCallConcurrency?: number;
    /** strict tool calling */
    strict?: boolean;
}