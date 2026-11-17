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

export interface PacMetaStore {
    readonly doc: { readonly meta: PacFrontMatter } | null;
    updateMeta(patch: Partial<PacFrontMatter>): void;
}

export interface PacMetaMenuItem {
    label: string;
    icon: PacMetaIcon;
    /** 数字 1-5，对应 Alt+1 … Alt+5。 */
    hotKey?: number;
    onSelect: () => void;
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
    const capabilities: PacMetaMenu = {
        id: "capabilities",
        label: "能力",
        icon: IconTool,
        items: [
            {
                label: "自我介绍",
                icon: IconUserCircle,
                hotKey: 1,
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