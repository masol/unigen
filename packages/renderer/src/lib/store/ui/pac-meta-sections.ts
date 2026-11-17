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
        id: "inputs",
        label: "前置信息",
        description: "明确其他 Agent 调用本 Agent 前必须准备好的前置信息。",
        fields: ["inputs"],
    },
    {
        id: "tools",
        label: "AI装备栏",
        description: "声明本Agent的“装备栏”，包含各种工具和协作的子Agent。",
        fields: ["tools", "skills", "knowledgeBases"],
    },
];

export function normalizePacMeta(meta: unknown): PacFrontMatter {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
    return { ...(meta as PacFrontMatter) };
}

/**
 * 深拷贝 JSON 形状的值。
 *
 * 刻意不用 `structuredClone`：Svelte 5 的 `$state` 是 Proxy，结构化克隆
 * 算法不会走 proxy trap 读取内容，而是直接抛 `DataCloneError`。而 meta
 * 补丁经常是对话框里绑定在 `$state` 上的表单对象，因此必须走"逐属性读取"
 * 的路径——这同时也能把代理替换成普通对象，避免响应式对象泄漏进 store 真源。
 *
 * 契约上 PacFrontMatter 只包含 YAML 可序列化值；非普通对象（Date / Map /
 * Set 等）按引用保留，它们本身不可变，不影响后续的相等性比较。
 */
function clonePlainValue<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;

    if (Array.isArray(value)) {
        return value.map((item) => clonePlainValue(item)) as unknown as T;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        return value;
    }

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
        result[key] = clonePlainValue(source[key]);
    }
    return result as T;
}

export function clonePacMeta(meta: PacFrontMatter): PacFrontMatter {
    return clonePlainValue(meta);
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

/**
 * 稳定序列化：对象键排序后比较，避免键插入顺序不同导致"内容相同却判脏"。
 *
 * 与 `JSON.stringify` 保持一致地丢弃 `undefined` 值与函数/符号值，
 * 使等值语义与旧实现兼容。
 */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value) ?? "null";
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }

    const source = value as Record<string, unknown>;
    const entries = Object.keys(source)
        .filter((key) => source[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(source[key])}`);

    return `{${entries.join(",")}}`;
}

export function isPacMetaEqual(a: PacFrontMatter, b: PacFrontMatter): boolean {
    return stableStringify(a) === stableStringify(b);
}