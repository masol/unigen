/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LeftSidebarItem } from "$lib/utils/plugin/extpoint/leftsidebar"
import { IconBook2, IconSparkles, IconPhotoAi, IconTable, IconVideo } from "@tabler/icons-svelte"
import type { Component } from "svelte"
import { InputManagerPanel } from './input-manager/index'
import SettingPanel from './spec-setting/SettingsPanel.svelte'
import EntityPanel from './entities/Entities.svelte'
import ShotList from "./shot-list/ShotList.svelte"
import OutputExplorer from './output-explorer/Explorer.svelte'

const activities: LeftSidebarItem[] = [
    { id: 'input-manager', icon: IconBook2 as unknown as Component<any>, label: '输入管理', component: InputManagerPanel, header: null },
    { id: 'spec-setting', icon: IconSparkles as unknown as Component<any>, label: '生成规格', component: SettingPanel, header: null },
    { id: 'shotlist', icon: IconTable as unknown as Component<any>, label: '镜头表', component: ShotList, header: null },
    { id: 'entities', icon: IconPhotoAi as unknown as Component<any>, label: '实体表', component: EntityPanel, header: null },
    { id: 'output-explorer', icon: IconVideo as unknown as Component<any>, label: '输出', component: OutputExplorer, header: null },
]

export default activities;
