import { dialogStore } from "$lib/store/ui/dialog.svelte";
import {
    PAC_META_CAPABILITY_GROUPS,
    PAC_META_SECTIONS,
    pickPacMetaSection,
} from "$lib/store/ui/pac-meta-sections";
import type { PacFrontMatter } from "@app/main/types";
import {
    IconListCheck,
    IconMessage,
    IconSettings,
    IconTool,
    IconUserCircle,
} from "@tabler/icons-svelte";
import type { Component } from "svelte";

import PacMetaEnvironmentDialog from "./dialog/env/PacMetaEnvironmentDialog.svelte";
import PacMetaInputsContractDialog from "./dialog/PacMetaInputsContractDialog.svelte";
import PacMetaIntroDialog from "./dialog/PacMetaIntroDialog.svelte";
import PacMetaUserTemplateDialog from "./dialog/PacMetaUserTemplateDialog.svelte";
import PacMetaToolsDialog from "./dialog/tools/PacMetaToolsDialog.svelte";

/**
 * Tabler 图标是 class 组件，与 Lucide 的 `Component<LucideProps>` 函数签名不兼容。
 * 这里直接用 Tabler 图标的构造签名作为菜单图标类型。
 */
type PacMetaIcon = typeof IconTool;
type PacMetaBadgeTone = "muted" | "warning";

export interface PacMetaStore {
    readonly doc: {
        readonly meta: PacFrontMatter;
        readonly path: string;
    } | null;
    updateMeta(patch: Partial<PacFrontMatter>): void;
}

export interface PacMetaMenuItem {
    label: string;
    icon: PacMetaIcon;
    /** 数字 1-5，对应 Alt+1 … Alt+5。 */
    hotKey?: number;
    onSelect: () => void;
    /** 右上角小角标；为空时不渲染。 */
    badge?: string;
    badgeTone?: PacMetaBadgeTone;
    /** 非阻塞提示；用于 title / Tooltip，不弹 toast。 */
    warning?: string;
}

/**
 * Toolbar 右端元信息菜单。
 *
 * - `items` 非空：渲染为下拉菜单（"能力"）；
 * - 仅 `onSelect`：渲染为普通按钮，点击即打开对应分区的编辑对话框（"输入" / "环境"）。
 */
export interface PacMetaMenu {
    id: string;
    label: string;
    icon: PacMetaIcon;
    /** 数字 1-5，对应 Alt+1 … Alt+5。 */
    hotKey?: number;
    items?: PacMetaMenuItem[];
    onSelect?: () => void;
    badge?: string;
    badgeTone?: PacMetaBadgeTone;
    warning?: string;
}

type MetaDialogComponent = Component<{
    value: Partial<PacFrontMatter>;
    onClose?: (result: Partial<PacFrontMatter>) => void;
    onCancel?: () => void;
}>;

/**
 * 为每个对话框分配唯一 ID，用于关闭已打开的同类对话框。
 */
const DIALOG_IDS = {
    intro: "pac-meta-intro",
    inputs_contract: "pac-meta-inputs-contract",
    tools: "pac-meta-tools",
    user_template: "pac-meta-user-template",
    environment: "pac-meta-environment",
} as const;

const INPUT_REQUIRED_WARNING =
    "未设置前置信息。子 Agent 通常需要前置信息；若通过变量系统处理，可忽略此提示。";

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): boolean {
    return typeof value === "string" && value.trim().length > 0;
}

function isIndexFile(path: string): boolean {
    const name = path.split("/").filter(Boolean).at(-1) ?? "";
    return name.toLowerCase() === "index.md";
}

/**
 * 装备数量：tools 数组（type=agent 的子 Agent 已包含在内）+ skills。
 * knowledgeBases 不计入，避免与“工具 / 技能 / 子 Agent”的口径混淆。
 */
function countEquipments(meta: PacFrontMatter): number {
    const tools = Array.isArray(meta.tools) ? meta.tools.length : 0;
    const skills = Array.isArray(meta.skills) ? meta.skills.length : 0;
    return tools + skills;
}

function countInputProperties(inputs: unknown): number {
    if (!isPlainObject(inputs)) return 0;

    const schema =
        inputs.type === "array" && isPlainObject(inputs.items)
            ? inputs.items
            : inputs;
    const properties = schema.properties;

    if (!isPlainObject(properties)) return 0;
    return Object.keys(properties).length;
}

/**
 * 只有确定没有任何前置信息时才返回 true。
 * 非普通对象（例如手动写入的自定义 schema）视为已有定义，避免误报。
 */
function isInputsEmpty(inputs: unknown): boolean {
    if (inputs === undefined || inputs === null) return true;
    if (!isPlainObject(inputs)) return false;
    if (Object.keys(inputs).length === 0) return true;

    const schema =
        inputs.type === "array" && isPlainObject(inputs.items)
            ? inputs.items
            : inputs;

    const properties = schema.properties;
    if (isPlainObject(properties)) {
        return Object.keys(properties).length === 0;
    }

    return schema.type === "object" || schema.type === "array";
}

function hasEnvironmentValue(
    field: keyof PacFrontMatter,
    value: unknown,
): boolean {
    // history: null 表示“全部历史”，是有效设置，不能按未设置处理。
    if (field === "history") {
        return value === null || typeof value === "number";
    }

    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (isPlainObject(value)) return Object.keys(value).length > 0;
    return true;
}

function countEnvironmentRequirements(meta: PacFrontMatter): number {
    return PAC_META_SECTIONS.environment.fields.reduce((count, field) => {
        return hasEnvironmentValue(field, meta[field]) ? count + 1 : count;
    }, 0);
}

function buildIntroWarning(
    hasName: boolean,
    hasDescription: boolean,
): string | undefined {
    if (hasName && hasDescription) return undefined;

    const missing: string[] = [];
    if (!hasName) missing.push("名称");
    if (!hasDescription) missing.push("简介");

    return `建议补充${missing.join("、")}，便于其他 Agent 发现与调用。`;
}

async function openMetaDialog(
    store: PacMetaStore,
    component: MetaDialogComponent,
    fields: readonly (keyof PacFrontMatter)[],
    dialogId: string,
): Promise<void> {
    // 关闭已打开的同类对话框
    if (dialogStore.isDialogOpen(dialogId)) {
        dialogStore.cancel(dialogId, "replaced");
    }

    const initial = pickPacMetaSection(store.doc?.meta ?? {}, { fields });

    const result = (await dialogStore.safeShow(
        component,
        { value: initial },
        { size: "xl6", showCloseButton: true, id: dialogId },
    )) as Partial<PacFrontMatter> | null;

    if (result === null) return;

    store.updateMeta(result);
}

const INTRO_GROUP = PAC_META_CAPABILITY_GROUPS.find((g) => g.id === "intro")!;
const TOOLS_GROUP = PAC_META_CAPABILITY_GROUPS.find((g) => g.id === "tools")!;
const CONTRACT_GROUP = PAC_META_CAPABILITY_GROUPS.find((g) => g.id === "inputs")!;

export function createPacMetaActions(store: PacMetaStore): PacMetaMenu[] {
    const meta = store.doc?.meta ?? {};
    const path = store.doc?.path ?? "";
    const isIndex = isIndexFile(path);

    const equipmentCount = countEquipments(meta);
    const inputCount = countInputProperties(meta.inputs);
    const inputWarning =
        !isIndex && inputCount === 0 && isInputsEmpty(meta.inputs)
            ? INPUT_REQUIRED_WARNING
            : undefined;

    const hasName = hasText(meta.name);
    const hasDescription = hasText(meta.description);
    const introWarning = isIndex
        ? undefined
        : buildIntroWarning(hasName, hasDescription);

    const environmentCount = countEnvironmentRequirements(meta);
    const capabilityWarning =
        [introWarning, inputWarning]
            .filter((message): message is string => Boolean(message))
            .join("；") || undefined;

    const capabilities: PacMetaMenu = {
        id: "capabilities",
        label: "能力",
        icon: IconTool,
        badge: equipmentCount > 0 ? String(equipmentCount) : undefined,
        badgeTone: "muted",
        warning: capabilityWarning,
        items: [
            {
                label: "自我介绍",
                icon: IconUserCircle,
                hotKey: 1,
                badge: introWarning ? "!" : undefined,
                badgeTone: introWarning ? "warning" : undefined,
                warning: introWarning,
                onSelect: () => {
                    void openMetaDialog(
                        store,
                        PacMetaIntroDialog,
                        INTRO_GROUP.fields,
                        DIALOG_IDS.intro,
                    );
                },
            },
            {
                label: "前置信息",
                icon: IconListCheck,
                hotKey: 2,
                badge: inputWarning
                    ? "!"
                    : inputCount > 0
                        ? String(inputCount)
                        : undefined,
                badgeTone: inputWarning ? "warning" : "muted",
                warning: inputWarning,
                onSelect: () => {
                    void openMetaDialog(
                        store,
                        PacMetaInputsContractDialog,
                        CONTRACT_GROUP.fields,
                        DIALOG_IDS.inputs_contract,
                    );
                },
            },
            {
                label: "AI装备栏",
                icon: IconTool,
                hotKey: 3,
                badge: equipmentCount > 0 ? String(equipmentCount) : undefined,
                badgeTone: "muted",
                onSelect: () => {
                    void openMetaDialog(
                        store,
                        PacMetaToolsDialog,
                        TOOLS_GROUP.fields,
                        DIALOG_IDS.tools,
                    );
                },
            },
        ],
    };

    const inputs: PacMetaMenu = {
        id: "inputs",
        label: "输入",
        icon: IconMessage,
        hotKey: 4,
        onSelect: () => {
            void openMetaDialog(
                store,
                PacMetaUserTemplateDialog,
                PAC_META_SECTIONS.inputs.fields,
                DIALOG_IDS.user_template,
            );
        },
    };

    const environment: PacMetaMenu = {
        id: "environment",
        label: "环境",
        icon: IconSettings,
        hotKey: 5,
        badge: environmentCount > 0 ? String(environmentCount) : undefined,
        badgeTone: "muted",
        onSelect: () => {
            void openMetaDialog(
                store,
                PacMetaEnvironmentDialog,
                PAC_META_SECTIONS.environment.fields,
                DIALOG_IDS.environment,
            );
        },
    };

    return [capabilities, inputs, environment];
}

/**
 * 匹配 Alt+1 … Alt+5 元信息热键并触发对应动作。
 *
 * 使用 `event.code` 而非 `event.key`：macOS 上 Alt+数字会生成特殊字符，
 * `event.key` 不可靠，`Digit1` … `Digit5` 跨平台稳定。
 *
 * 返回 true 表示已处理（调用方无需再处理）。
 */
export function matchPacMetaHotkey(
    actions: readonly PacMetaMenu[],
    event: KeyboardEvent,
): boolean {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return false;
    }

    for (const menu of actions) {
        if (menu.hotKey && event.code === `Digit${menu.hotKey}`) {
            event.preventDefault();
            menu.onSelect?.();
            return true;
        }

        for (const item of menu.items ?? []) {
            if (item.hotKey && event.code === `Digit${item.hotKey}`) {
                event.preventDefault();
                item.onSelect();
                return true;
            }
        }
    }

    return false;
}