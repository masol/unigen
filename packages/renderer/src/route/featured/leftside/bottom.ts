import type { LeftSidebarItem } from "$lib/utils/plugin/extpoint/leftsidebar";
import SettingHeader from "./setting.header.svelte";
import SettingPanel from "./setting.svelte";

const bottomActivities: LeftSidebarItem[] = [
    {
        id: "settings",
        icon: "IconSettings",
        label: "设置",
        component: SettingPanel,
        header: SettingHeader,
    },
];

export default bottomActivities;