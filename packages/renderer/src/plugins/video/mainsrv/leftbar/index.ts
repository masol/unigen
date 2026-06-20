/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LeftSidebarItem } from "$lib/utils/plugin/extpoint/leftsidebar"
import { IconFolder, IconSearch } from "@tabler/icons-svelte"
import type { Component } from "svelte"
import FileExplorer from './FileExplorer.svelte'
import SearchPanel from './SearchPanel.svelte'

const activities: LeftSidebarItem[] = [
    { id: 'file-explorer', icon: IconFolder as unknown as Component<any>, label: '资源管理器', component: FileExplorer, header: null },
    { id: 'searching', icon: IconSearch as unknown as Component<any>, label: '搜索', component: SearchPanel, header: null },
]

export default activities;