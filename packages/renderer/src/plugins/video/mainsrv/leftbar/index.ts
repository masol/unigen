/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LeftSidebarItem } from "$lib/utils/plugin/extpoint/leftsidebar"
import { IconFolder, IconSettingsAi } from "@tabler/icons-svelte"
import type { Component } from "svelte"
import { InputManagerPanel } from './input-manager/index'
import SettingPanel from './task-setting/SettingsPanel.svelte'
const activities: LeftSidebarItem[] = [
    { id: 'input-manager', icon: IconFolder as unknown as Component<any>, label: '输入管理', component: InputManagerPanel, header: null },
    { id: 'task-setting', icon: IconSettingsAi as unknown as Component<any>, label: '任务设置', component: SettingPanel, header: null },
]

export default activities;
