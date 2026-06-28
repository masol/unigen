/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LeftSidebarItem } from "$lib/utils/plugin/extpoint/leftsidebar"
import { IconInputAi, IconSettingsAi } from "@tabler/icons-svelte"
import type { Component } from "svelte"
import { InputManagerPanel } from './input-manager/index'
import SettingPanel from './spec-setting/SettingsPanel.svelte'
const activities: LeftSidebarItem[] = [
    { id: 'input-manager', icon: IconInputAi as unknown as Component<any>, label: '输入管理', component: InputManagerPanel, header: null },
    { id: 'task-setting', icon: IconSettingsAi as unknown as Component<any>, label: '生成规格', component: SettingPanel, header: null },
]

export default activities;
