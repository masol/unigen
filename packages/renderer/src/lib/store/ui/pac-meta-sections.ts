import type { PacFrontMatter } from "@app/main/types";

export type PacMetaSectionId = "capabilities" | "inputs" | "environment";

export interface PacMetaSectionDefinition {
    id: PacMetaSectionId;
    label: string;
    description: string;
    fields: readonly (keyof PacFrontMatter)[];
}

/**
 * 能力分区的字段子集。
 *
 * Toolbar 上的"能力"下拉菜单按此拆分为 自我介绍 / 可用工具 / 输入要求，
 * 三个子项分别打开对应字段子集的编辑对话框。
 */
export interface PacMetaFieldGroup {
    id: string;
    label: string;
    description: string;
    fields: readonly (keyof PacFrontMatter)[];
}

export const PAC_META_SECTIONS: Record<PacMetaSectionId, PacMetaSectionDefinition> = {
    capabilities: {
        id: "capabilities",
        label: "能力",
        description:
            "定义 Agent 的自我介绍、可用工具、技能、知识库与输入契约，便于其他 Agent 发现与调用。",
        fields: ["name", "description", "tools", "skills", "knowledgeBases", "inputs"],
    },
    inputs: {
        id: "inputs",
        label: "输入",
        description:
            "定义其他 Agent 调用时如何将输入转化为用户提示词，包括用户模板与 _T_ 变量默认值。",
        fields: ["userTemplate", "userTemplatePath", "setDefault"],
    },
    environment: {
        id: "environment",
        label: "环境",
        description:
            "定义 Agent 运行环境：期望模型、推理深度、步数、流式、持久化、历史、超时与采样参数等。",
        fields: [
            "requireModel",
            "model",
            "maxSteps",
            "streaming",
            "reasoning",
            "persist",
            "history",
            "timeout",
            "temperature",
            "maxOutputTokens",
            "toolCallConcurrency",
            "strict",
        ],
    },
};

/**
 * "能力"分区在 Toolbar 下拉菜单中的三个字段子集。
 *
 * 三者合并覆盖 capabilities 分区的全部字段；capabilities 分区本身
 * 不再直接用于打开对话框。
 */
export const PAC_META_CAPABILITY_GROUPS: readonly PacMetaFieldGroup[] = [
    {
        id: "intro",
        label: "自我介绍",
        description: "定义 Agent 的名称与描述，便于其他 Agent 发现与调用。",
        fields: ["name", "description"],
    },
    {
        id: "tools",
        label: "可用工具",
        description: "声明 Agent 可用的内置工具、技能与知识库。",
        fields: ["tools", "skills", "knowledgeBases"],
    },
    {
        id: "inputs",
        label: "输入要求",
        description: "定义其他 Agent 调用时需要提供的输入契约。",
        fields: ["inputs"],
    },
];

export function normalizePacMeta(meta: unknown): PacFrontMatter {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
    return { ...(meta as PacFrontMatter) };
}

export function clonePacMeta(meta: PacFrontMatter): PacFrontMatter {
    if (typeof structuredClone === "function") {
        return structuredClone(meta);
    }

    return JSON.parse(JSON.stringify(meta)) as PacFrontMatter;
}

/**
 * 从完整 meta 中挑出给定 section/group 声明的字段。
 *
 * 入参结构化为 `{ fields }`，以便同时接受 `PacMetaSectionDefinition`
 * 与 `PacMetaFieldGroup`（能力分区的字段子集），无需调用方做类型转换。
 */
export function pickPacMetaSection(
    meta: PacFrontMatter,
    section: { fields: readonly (keyof PacFrontMatter)[] },
): Partial<PacFrontMatter> {
    const result: Record<string, unknown> = {};

    for (const field of section.fields) {
        const value = meta[field];
        if (value !== undefined) {
            result[field] = value;
        }
    }

    return result as Partial<PacFrontMatter>;
}

export function mergePacMeta(
    meta: PacFrontMatter,
    patch: Partial<PacFrontMatter>,
): PacFrontMatter {
    const next: Record<string, unknown> = { ...meta };

    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            next[key] = value;
        }
    }

    return next as PacFrontMatter;
}

export function isPacMetaEqual(a: PacFrontMatter, b: PacFrontMatter): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}