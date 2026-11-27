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
// 需求是一棵**树**：
//   - 叶子节点：一种具体依赖（model / embedding / rerank / runtime / mcp / config）；
//   - 组合节点：allOf（全部满足）/ anyOf（任意一个满足），`of` 子数组可递归嵌套。
//   - `type.json` 顶层的 `requirements` 数组等价于一个隐式 `allOf`。
//
// 扩展一种新需求类型的步骤：
//   1. 在下方定义 `<name>RequirementSchema`，并加入 `leafRequirementSchemas`；
//      —— 新叶子会自动出现在 `RequirementLeaf` 中，`ProjectRequirementType`
//      随之扩展，`libs/project/requirements.ts` 的 `checkers` 映射类型会
//      因缺少实现而**编译失败**；
//   2. 在 `libs/project/requirements.ts` 的 `checkers` 中实现同名检查器；
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
 * 所有需求节点共享的可选字段。
 *
 * **`severity` 故意不设默认值。** 默认值会在解析阶段把 `undefined` 填成
 * `"warning"`，从而抹掉「作者显式写了 warning」与「作者没写」的区别，
 * 让节点级的严重等级继承（见 `libs/project/requirements.ts` 的
 * `Inherited`）变成静默的语义错误。顶层默认值由检查器在遍历根节点时统一
 * 应用（`{ severity: "warning" }`），对外表现与旧版一致。
 */
const requirementCommonShape = {
    /** 缺失时的严重程度。省略时继承父节点；顶层省略视为 `warning`。 */
    severity: requirementSeveritySchema.optional(),
    /** 覆盖通知里的默认显示名（如「绘图模型」）。**不参与继承**。 */
    label: z.string().optional(),
    /** 缺失后果的一句话说明。省略时继承父节点。 */
    impact: z.string().optional(),
};

export const requirementCommonSchema = z.object(requirementCommonShape);

/** 需求节点共享的可选字段（由 `requirementCommonShape` 推导，勿手写重复） 。 */
export type RequirementCommon = z.infer<typeof requirementCommonSchema>;

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
 * 逃生通道：当上面几种语义化类型都表达不了时才使用。键名不做静态校验，
 * 由检查器在运行期对比真实配置键，拼错会得到一条明确的「配置项不存在」。
 */
export const configRequirementSchema = z.object({
    type: z.literal("config"),
    ...requirementCommonShape,
    /** 需要非空的配置键名（如 `task_dir`）。 */
    key: z.string().min(1),
});

/**
 * 全部叶子需求 schema。
 *
 * 这是「叶子类型」的**唯一来源**：`RequirementLeaf` 由本数组推导，
 * `projectRequirementSchema` 也直接展开本数组。新增叶子类型时只需在此
 * 追加一行，类型与检查器的联动会自动生效，不存在忘记同步类型的缺口。
 */
const leafRequirementSchemas = [
    modelRequirementSchema,
    embeddingRequirementSchema,
    rerankRequirementSchema,
    runtimeRequirementSchema,
    mcpRequirementSchema,
    configRequirementSchema,
] as const;

/** 叶子需求（不可再分）的类型联合。 */
export type RequirementLeaf = z.infer<(typeof leafRequirementSchemas)[number]>;

/**
 * 组合需求：把子需求按 `allOf` / `anyOf` 聚合。
 *
 * 手写而非 `z.infer` 的原因：`of` 递归指向 `projectRequirementSchema`，
 * 该 schema 必须显式标注 `z.ZodType<ProjectRequirement>` 才能断开类型推断
 * 的循环；而 `ProjectRequirement` 又不可能从它自身推断出来。
 *
 * 手写带来的漂移风险由**编译期**兜底：若将来给 `projectRequirementSchema`
 * 加了新的组合分支却漏写这里，标注处的可赋值性检查会直接失败。
 */
export type RequirementGroup =
    | (RequirementCommon & { type: "allOf"; of: ProjectRequirement[] })
    | (RequirementCommon & { type: "anyOf"; of: ProjectRequirement[] });

/** 需求树节点（递归类型）。 */
export type ProjectRequirement = RequirementLeaf | RequirementGroup;

/** 需求判别式类型集合，供 UI / 日志归类使用。 */
export type ProjectRequirementType = ProjectRequirement["type"];

/**
 * 组合节点共享的形状。
 *
 * `of` 用 `z.lazy` 引用 `projectRequirementSchema` 自身：lazy 的 getter 只在
 * parse 阶段执行，此时模块已完成初始化，既不会触发 TDZ，也允许任意深度嵌套。
 */
const requirementGroupShape = {
    ...requirementCommonShape,
    /** 子需求列表，至少一项。元素可为任意叶子或组合节点。 */
    of: z.array(z.lazy(() => projectRequirementSchema)).min(1),
};

/** 需要**全部**子需求满足。失败时把子项的缺失逐一上报，自身不产生条目。 */
export const allOfRequirementSchema = z.object({
    type: z.literal("allOf"),
    ...requirementGroupShape,
});

/**
 * 需要**任意一个**子需求满足。
 *
 * 全部备选都失败时才生成**一条**汇总条目（列出每个备选的失败原因）；
 * 任一通过即整组静默。
 */
export const anyOfRequirementSchema = z.object({
    type: z.literal("anyOf"),
    ...requirementGroupShape,
});

/**
 * 需求节点的统一 schema。
 *
 * 用 discriminatedUnion（而非 union）是为了让 `type` 写错时得到明确的
 * 「无效的判别值」错误，而不是若干个分支的联合报错。
 *
 * 类型注解不可省略：递归 schema 不加注解会让 TS 的类型推断陷入
 * 「自身引用自身」而报错。
 */
export const projectRequirementSchema: z.ZodType<ProjectRequirement> = z.lazy(
    () =>
        z.discriminatedUnion("type", [
            ...leafRequirementSchemas,
            allOfRequirementSchema,
            anyOfRequirementSchema,
        ]),
);

/**
 * 单条依赖缺失记录 —— **由系统生成**，模板不要写。
 *
 * 完整通知文案已经拼进 `ProjectActivityData.status`，此结构只用于让 UI
 * 决定标题与视觉等级（例如 `error` 用危险色确认按钮）。
 */
export const requirementIssueSchema = z.object({
    /** 来源需求的判别式类型；组合节点为 `"allOf"` / `"anyOf"`。 */
    type: z.string().min(1),
    severity: requirementSeveritySchema,
    /** 缺失项名称（作者 `label` 优先，否则由检查器生成）。 */
    label: z.string().min(1),
    /** 检查事实：为什么判定为缺失。 */
    message: z.string().min(1),
    /** 声明的（或从祖先继承的）缺失后果。 */
    impact: z.string().optional(),
    /** 修复指引。 */
    hint: z.string().optional(),
    /**
     * `anyOf` 汇总专用：被判定「全部备选都不满足」时，逐条列出每个备选的
     * 失败原因（已渲染成可直接阅读的短句）。其它节点不产生本字段。
     */
    alternatives: z.array(z.string().min(1)).optional(),
});

export type RequirementIssue = z.infer<typeof requirementIssueSchema>;