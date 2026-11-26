// packages/main/src/libs/project/requirements.ts
//
// 项目依赖需求检查。
//
// 职责边界：
//   - 本文件只负责「读配置 → 判断是否满足 → 生成结构化缺失记录」；
//   - 需求如何声明由 `$types/shared/template/requirement.js` 定义（纯协议）；
//   - 展示文案由 `formatRequirementIssues` 生成，UI 只负责标题与视觉等级。
//
// 扩展方式：新增一种需求类型时，
//   1. 在 `$types/shared/template/requirement.js` 的 discriminatedUnion 中加分支；
//   2. 在下方 `checkers` 中注册同名检查器（映射类型会强制要求补全）；
//   3. 在 `docs/Panel-JSON.md` 补一节说明。
// 不需要改动本文件之外的调度逻辑。
//
// 容错原则：单项检查抛异常只记日志并跳过，绝不影响项目打开，也不吞掉
// 其它检查结果。

import { configService } from "$libs/store/index.js";
import { stableConfig } from "$libs/store/stable.js";
import type { AppConfig } from "$types/appconfig.js";
import type {
    CodeRuntimeEngineConfig,
    CodeRuntimeEngineId,
} from "$types/shared/env/code-runtime.js";
import { ModelTags, type Model, type Provider } from "$types/shared/model.js";
import type {
    ProjectRequirement,
    RequirementIssue,
} from "$types/shared/template/requirement.js";
import Logger from "electron-log/main.js";

/**
 * 单个检查器的返回。
 *
 * `ok: true` 时不需要任何文案；缺失时才要求说明「叫什么、为什么缺、怎么修」。
 */
type RequirementCheckResult =
    | { ok: true }
    | {
        /** 缺失项默认名称（需求作者可用 `label` 覆盖）。 */
        label: string;
        /** 检查事实：为什么判定为缺失。 */
        reason: string;
        /** 修复指引。 */
        hint?: string;
        ok: false;
    };

/** 模型能力标签 → 中文显示名。未收录的标签回退为裸标签名。 */
const MODEL_TAG_LABELS: Partial<Record<ModelTags, string>> = {
    [ModelTags.Embedding]: "嵌入",
    [ModelTags.Rerank]: "重排",
    [ModelTags.TextGeneration]: "文本生成",
    [ModelTags.ImageGeneration]: "绘图",
    [ModelTags.VideoGeneration]: "视频",
    [ModelTags.AudioGeneration]: "语音合成",
    [ModelTags.AudioUnderstanding]: "语音理解",
    [ModelTags.BGM]: "背景音乐",
    [ModelTags.MT]: "翻译",
    [ModelTags.G3D]: "3D 生成",
};

/** 引擎 id → 显示名。 */
const ENGINE_LABELS: Record<CodeRuntimeEngineId, string> = {
    python: "Python",
    nodejs: "Node.js",
    aria2: "aria2",
    ffmpeg: "FFmpeg",
};

/** 判断配置值是否「已填」。空串 / 空数组 / null / undefined 视为未填。 */
function isNonEmpty(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

/**
 * 列出当前可用模型（服务商未被禁用）。
 *
 * 返回 `provider` 只是为了将来需要展示来源；当前检查只消费 `model`。
 */
function listAvailableModels(): Array<{
    provider: Provider;
    model: Model;
}> {
    const providers = configService().get("models") ?? [];
    const result: Array<{ provider: Provider; model: Model }> = [];

    for (const provider of providers) {
        if (provider.disabled) continue;
        for (const model of provider.models ?? []) {
            result.push({ provider, model });
        }
    }

    return result;
}

/**
 * 每种需求类型对应的检查器。
 *
 * 映射类型 `[K in ProjectRequirement["type"]]` 保证：新增需求类型分支时，
 * 这里漏实现会直接编译失败，而不是在运行期静默通过。
 */
const checkers: {
    [K in ProjectRequirement["type"]]: (
        req: Extract<ProjectRequirement, { type: K }>,
    ) => RequirementCheckResult;
} = {
    model: (req) => {
        const tags = req.abilities;
        const hits = listAvailableModels().filter(({ model }) =>
            tags.every((tag) => (model.abilities ?? []).includes(tag)),
        );

        if (hits.length > 0) return { ok: true };

        const tagText = tags
            .map((tag) => MODEL_TAG_LABELS[tag] ?? `\`${tag}\``)
            .join(" + ");

        return {
            ok: false,
            label: tagText,
            reason: `未找到具备「${tagText}」能力的可用模型。`,
            hint: "在「设置 → AIGC模型」中添加对应服务商与模型，并确认服务商未被禁用。",
        };
    },

    embedding: () => {
        if (isNonEmpty(configService().get("embed_model"))) return { ok: true };

        return {
            ok: false,
            label: "嵌入模型",
            reason: "尚未配置嵌入模型，语义检索会退化为全文检索，召回质量下降。",
            hint: "在「设置 → 常规 → 搜索配置」中设置嵌入模型。",
        };
    },

    rerank: () => {
        if (isNonEmpty(configService().get("rerank_model"))) return { ok: true };

        return {
            ok: false,
            label: "重排模型",
            reason: "尚未配置重排模型，召回结果无法重排与截断，检索质量下降。",
            hint: "在「设置 → 常规 → 搜索配置」中设置重排模型。",
        };
    },

    runtime: (req) => {
        const engine = req.engine;
        const engineName = ENGINE_LABELS[engine] ?? engine;
        const label = `${engineName} 运行时`;

        // `codeRuntime.engines` 的类型是 `Record<...>`，但运行时允许缺键
        // （schema 层缺失键等价于「默认关闭」），因此按 Partial 读取。
        const configs = (stableConfig().get("codeRuntime").engines ??
            {}) as Partial<
                Record<CodeRuntimeEngineId, CodeRuntimeEngineConfig>
            >;
        const cfg = configs[engine];

        if (!cfg?.enabled) {
            return {
                ok: false,
                label,
                reason: `未启用 ${engineName}，依赖它的命令与脚本无法执行。`,
                hint: "在「设置  → 本机工具」中启用该运行时。",
            };
        }

        const state = stableConfig().get("codeRuntimeStatus").engines?.[
            engine
        ]?.state;

        if (state !== "ready") {
            return {
                ok: false,
                label,
                reason:
                    state === "installing"
                        ? `${engineName} 正在安装，安装完成前无法执行。`
                        : `${engineName} 尚未就绪（当前状态：${state ?? "not_ready"}）。`,
                hint: "在「设置  → 本机工具」中完成该运行时的安装与验证。",
            };
        }

        return { ok: true };
    },

    mcp: (req) => {
        const servers = configService().get("mcpServers") ?? [];
        const server = servers.find((s) => s.id === req.id);
        const label = `MCP 服务「${req.id}」`;

        if (!server) {
            return {
                ok: false,
                label,
                reason: `未找到 id 为 \`${req.id}\` 的 MCP 服务配置。`,
                hint: "在「设置 → MCP」中添加并启用对应服务。",
            };
        }

        if (server.enabled === false) {
            return {
                ok: false,
                label,
                reason: `MCP 服务 \`${req.id}\` 已配置，但当前处于禁用状态。`,
                hint: "在「设置 → MCP」中启用该服务。",
            };
        }

        return { ok: true };
    },

    config: (req) => {
        const all = configService().getAll();
        const key = req.key as keyof AppConfig;
        const label = `配置项「${req.key}」`;

        if (!(key in all)) {
            return {
                ok: false,
                label,
                reason: `当前版本不存在名为 \`${req.key}\` 的配置项。`,
                hint: "检查 type.json 中 requirements 的键名是否拼写有误。",
            };
        }

        if (isNonEmpty(all[key])) return { ok: true };

        return {
            ok: false,
            label,
            reason: `配置项 \`${req.key}\` 尚未填写。`,
            hint: "在「设置」中补齐该配置项。",
        };
    },
};

/**
 * 检查单条需求，返回缺失记录；满足时返回 `null`。
 *
 * 类型收窄由 `checkers` 的映射类型保证，但 TS 无法在调用点把联合类型
 * 收窄到对应分支，因此在函数边界做一次断言。
 */
function checkOne(req: ProjectRequirement): RequirementIssue | null {
    const checker = checkers[req.type] as (
        r: ProjectRequirement,
    ) => RequirementCheckResult;

    const result = checker(req);
    if (result.ok) return null;

    return {
        type: req.type,
        severity: req.severity,
        label: req.label ?? result.label,
        message: result.reason,
        impact: req.impact,
        hint: result.hint,
    };
}

/**
 * 逐项检查项目声明的全部需求。
 *
 * - 未声明或空数组：返回空数组，调用方无需做特殊分支；
 * - 单项检查抛异常：记录日志并跳过，不影响其它检查结果，也不影响项目打开。
 */
export function checkProjectRequirements(
    requirements: readonly ProjectRequirement[] | undefined,
): RequirementIssue[] {
    if (!requirements?.length) return [];

    const issues: RequirementIssue[] = [];

    for (const req of requirements) {
        try {
            const issue = checkOne(req);
            if (issue) issues.push(issue);
        } catch (error) {
            Logger.error(`[Project] 依赖检查异常（type=${req.type}）`, error);
        }
    }

    return issues;
}

/**
 * 把缺失记录拼成 Markdown 通知文案。
 *
 * 约定：
 *   - 明确写出「不影响项目打开」，避免用户误以为项目被拒绝；
 *   - `error` 级别额外提示可通过修改项目的「AI 工作指南」绕开相关能力；
 *   - 每条记录包含：等级 · 名称 · 事实 · 影响（作者声明）· 处理（修复指引）。
 */
export function formatRequirementIssues(
    issues: readonly RequirementIssue[],
): string {
    if (issues.length === 0) return "";

    const hasError = issues.some((issue) => issue.severity === "error");
    const lines: string[] = [];

    lines.push(
        hasError
            ? "**本项目缺少必要依赖。** 相关核心功能将无法使用。项目仍会正常打开，补齐配置后即可正常。"
            : "**以下可选依赖尚未就绪。** 相关功能可能不工作。",
    );
    lines.push("");

    for (const issue of issues) {
        const level = issue.severity === "error" ? "必需" : "建议";
        lines.push(`- **【${level}】${issue.label}**：${issue.message}`);
        if (issue.impact) {
            lines.push(`  - 影响：${issue.impact}`);
        }
        if (issue.hint) {
            lines.push(`  - 处理：${issue.hint}`);
        }
    }

    if (hasError) {
        lines.push("");
        lines.push(
            "> 若暂时无法补齐上述依赖，可修改项目内的「AI 工作指南」，绕开相关需求。",
        );
    }

    return lines.join("\n");
}