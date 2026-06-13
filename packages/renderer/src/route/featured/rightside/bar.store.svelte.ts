/* eslint-disable @typescript-eslint/no-explicit-any */
// featured/rightside/store.svelte.ts
import {
    IconListTree,
    IconClock,
} from "@tabler/icons-svelte";
import type { Component } from "svelte";

export type PanelTab = {
    id: string;
    label: string;
    Icon: Component<any>;
};

function createRightPanelStore() {
    let activeTab = $state<string>("outline");

    const tabs: PanelTab[] = [
        { id: "outline", label: "大纲", Icon: IconListTree as unknown as Component<any> },
        { id: "timeline", label: "时间线", Icon: IconClock as unknown as Component<any> },
    ];

    return {
        get activeTab() {
            return activeTab;
        },
        set activeTab(value: string) {
            activeTab = value;
        },
        get tabs() {
            return tabs;
        },
    };
}

export const rightPanelStore = createRightPanelStore();