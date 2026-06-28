/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LeftSidebarItem } from "$lib/utils/plugin/extpoint/leftsidebar"
import { IconUserCircle, IconSettings } from "@tabler/icons-svelte"
import type { Component } from "svelte"
import SettingPanel from './setting.svelte'
import SettingHeader from './setting.header.svelte'
import Fallback from "./fallback.svelte"

import { InputManagerPanel } from "../../../plugins/video/mainsrv/leftbar/input-manager/index"

const bottomActivities: LeftSidebarItem[] = [
    { id: 'account', icon: IconUserCircle as unknown as Component<any>, label: '账户', component: Fallback, header: null },
    { id: 'settings', icon: IconSettings as unknown as Component<any>, label: '设置', component: SettingPanel, header: SettingHeader },
    { id: 'InputManagerPanel', icon: IconUserCircle as unknown as Component<any>, label: '输入管理', component: InputManagerPanel, header: null },

]

export default bottomActivities;