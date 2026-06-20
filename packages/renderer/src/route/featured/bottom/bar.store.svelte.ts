type BottomTab = {
    id: string;
    label: string;
    badge: number;
};

function createBottomPanelStore() {
    let activeTab = $state("logger");
    const tabs = $state<BottomTab[]>([
        { id: "logger", label: "日志", badge: 0 },
        { id: "output", label: "输出", badge: 0 },
        { id: "terminal", label: "终端", badge: 0 },
    ]);

    return {
        get activeTab() {
            return activeTab;
        },
        get tabs() {
            return tabs;
        },
        setActiveTab(id: string) {
            activeTab = id;
        },
        setBadge(id: string, count: number) {
            const tab = tabs.find((t) => t.id === id);
            if (tab) {
                tab.badge = count;
            }
        },
    };
}

export const bottomPanelStore = createBottomPanelStore();