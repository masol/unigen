// packages/main/src/types/shared/template/requirement.ts
//
// 项目类型（`type.json`）的「依赖需求」声明与检查结果协议。
//
// 设计边界：
//   - 本文件只描述**协议**（作者怎么声明需求、系统回报什么结果），
//     不包含任何检查逻辑，也不依赖 Node / Electron API；
//   - 检查实现位于 `libs/project/requirements.ts`，主进程专用；
//   - 渲染进程只消费 `RequirementIssue`，用于决定通知的标题与视觉等级。
//
// 扩展一种新需求类型的步骤：
//   1. 在下方定义 `<name>RequirementSchema`，加入 `projectRequirementSchema`
//      的 discriminatedUnion；
//   2. 在 `libs/project/requirements.ts` 的 `checkers` 中实现同名检查器
//      （映射类型会强制要求补全，漏写会编译失败）；
//   3. 在 `docs/Panel-JSON.md` 补一节类型说明。

import { z } from "zod";
import { CODE_RUNTIME_ENGINE_IDS } from "../env/code-runtime.js";
import { ModelTags } from "../model.js";

/**
 * 依赖缺失的严重程度。
 *
 * - `warning`：相关功能不可用或质量下降，项目其余部分仍可正常使用；
 * - `error`  ：该类型的核心流程无法完成。
 *
 * **两种级别都不会阻止项目打开**：用户可先进入项目，之后再补齐配置。
 */
export const requirementSeveritySchema = z.enum(["warning", "error"]);

export type RequirementSeverity = z.infer<typeof requirementSeveritySchema>;

/**
 * 所有需求项共享的可选字段。
 *
 * 注意：`severity` 带默认值，作者不写时按 `warning` 处理。默认值依赖
 * `validatePrjData()` 使用 `safeParse().data`（而非原始输入）返回结果，
 * 否则 `.default()` 不会生效。
 */
const requirementCommonShape = {
    /** 缺失时的严重程度，默认 `warning`。 */
    severity: requirementSeveritySchema.default("warning"),
    /** 覆盖通知里的默认显示名（如「绘图模型」）。不填则由检查器生成。 */
    label: z.string().optional(),
    /** 缺失后果的一句话说明，会追加到通知中。建议写业务影响而非技术细节。 */
    impact: z.string().optional(),
};

/**
 * 需要某个能力的模型可用。
 *
 * 「可用」的定义：服务商未 `disabled`，且模型 `abilities` 覆盖全部所需标签。
 */
export const modelRequirementSchema = z.object({
    type: z.literal("model"),
    ...requirementCommonShape,
    /**
     * 需要的模型能力标签，**全部命中**才视为满足。
     *
     * - `["image-generation"]`：任意一个可用绘图模型即可；
     * - `["video-generation", "ff"]`：必须同时支持视频生成与首尾帧。
     */
    abilities: z.array(z.enum(ModelTags)).min(1),
});

/** 需要配置嵌入模型（语义检索）。 */
export const embeddingRequirementSchema = z.object({
    type: z.literal("embedding"),
    ...requirementCommonShape,
});

/** 需要配置重排模型（召回结果重排与截断）。 */
export const rerankRequirementSchema = z.object({
    type: z.literal("rerank"),
    ...requirementCommonShape,
});

/** 需要某个本机运行时 / 工具处于「已启用且就绪」状态。 */
export const runtimeRequirementSchema = z.object({
    type: z.literal("runtime"),
    ...requirementCommonShape,
    /** 运行时引擎 id，与 `CodeRuntimeEngineId` 同源。 */
    engine: z.enum(CODE_RUNTIME_ENGINE_IDS),
});

/** 需要某个 MCP 服务已配置且启用。 */
export const mcpRequirementSchema = z.object({
    type: z.literal("mcp"),
    ...requirementCommonShape,
    /** 需要的 MCP server id（与设置中 MCP 服务的 `id` 一致）。 */
    id: z.string().min(1),
});

/**
 * 需要某个 `AppConfig` 键非空。
 *
 * 逃生通道：当上面几种语义化类型都表达不了时使用。键名不做静态校验，
 * 由检查器在运行期对比真实配置键，拼错会得到一条明确的「配置项不存在」。
 */
export const configRequirementSchema = z.object({
    type: z.literal("config"),
    ...requirementCommonShape,
    /** 需要非空的配置键名（如 `task_dir`）。 */
    key: z.string().min(1),
});

export const projectRequirementSchema = z.discriminatedUnion("type", [
    modelRequirementSchema,
    embeddingRequirementSchema,
    rerankRequirementSchema,
    runtimeRequirementSchema,
    mcpRequirementSchema,
    configRequirementSchema,
]);

export type ProjectRequirement = z.infer<typeof projectRequirementSchema>;

/** 需求判别式类型集合，供 UI / 日志归类使用。 */
export type ProjectRequirementType = ProjectRequirement["type"];

/**
 * 单条依赖缺失记录 —— **由系统生成**，模板不要写。
 *
 * 完整通知文案已经拼进 `ProjectActivityData.status`，此结构只用于让 UI
 * 决定标题与视觉等级（例如 `error` 用危险色确认按钮）。
 */
export const requirementIssueSchema = z.object({
    /** 来源需求的判别式类型。 */
    type: z.string().min(1),
    severity: requirementSeveritySchema,
    /** 缺失项名称（作者 `label` 优先，否则由检查器生成）。 */
    label: z.string().min(1),
    /** 检查事实：为什么判定为缺失。 */
    message: z.string().min(1),
    /** 作者声明的缺失后果。 */
    impact: z.string().optional(),
    /** 修复指引。 */
    hint: z.string().optional(),
});

export type RequirementIssue = z.infer<typeof requirementIssueSchema>;