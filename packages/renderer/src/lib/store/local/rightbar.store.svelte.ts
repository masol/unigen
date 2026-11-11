/* eslint-disable @typescript-eslint/no-explicit-any */
// featured/rightside/store.svelte.ts
import {
    IconDeviceImacSearch,
    // IconAiAgent,
    IconSketching
} from "@tabler/icons-svelte";
import type { Component } from "svelte";
import { configStore } from "../config.svelte";

export type PanelTab = {
    id: string;
    label: string;
    Icon: Component<any>;
};

const DEV_ONLY_TAB_IDS = new Set(["blueprint"]);

function createRightPanelStore() {
    // 1) 真实的用户意图，只在“点 tab / 主动切换”时被写入
    let activeTabId = $state<string>("toolsearch");
    // 3) 对外暴露的 activeTab 是派生值：
    //    当前 id 若已不在合法 tabs 里（例如 showDevUI 关闭导致 assistant 消失），自动回退默认值
    const activeTab = $derived<string>(
        configStore.showDevUI ?
            activeTabId :
            DEV_ONLY_TAB_IDS.has(activeTabId) ? "toolsearch" : activeTabId
    );

    const tabs = $derived<PanelTab[]>([
        ...(configStore.showDevUI
            ? [{ id: "blueprint", label: "蓝图", Icon: IconSketching as unknown as Component<any> }]
            : []),
        { id: "toolsearch", label: "工具", Icon: IconDeviceImacSearch as unknown as Component<any> }
    ]);

    return {
        get activeTab() {
            return activeTab;
        },
        set activeTab(value: string) {
            activeTabId = value;
        },
        get tabs() {
            return tabs;
        },
    };
}

const KEY = Symbol.for('unigen.renderer.rightPanelStore');
export const rightPanelStore = ((globalThis as any)[KEY] ??= createRightPanelStore());