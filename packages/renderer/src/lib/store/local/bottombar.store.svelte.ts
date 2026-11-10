import { configStore } from "../config.svelte";

type BottomTab = {
    id: string;
    label: string;
    badge: number;
};

const DEV_ONLY_TAB_IDS = new Set(["dag"]);


function createBottomPanelStore() {
    let activeTabId = $state<string>("logger");
    const activeTab = $derived<string>(
        configStore.showDevUI ?
            activeTabId :
            DEV_ONLY_TAB_IDS.has(activeTabId) ? "logger" : activeTabId
    );

    const tabs = $derived<BottomTab[]>([
        { id: "logger", label: "日志", badge: 0 },
        ...(configStore.showDevUI
            ? [{ id: "dag", label: "DAG", badge: 0 }]
            : []),
    ]);

    return {
        get activeTab() {
            return activeTab;
        },
        get tabs() {
            return tabs;
        },
        setActiveTab(id: string) {
            activeTabId = id;
        },
        setBadge(id: string, count: number) {
            const tab = tabs.find((t) => t.id === id);
            if (tab) {
                tab.badge = count;
            }
        },
    };
}

const KEY = Symbol.for('unigen.renderer.bottomPanelStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const bottomPanelStore = ((globalThis as any)[KEY] ??= createBottomPanelStore());