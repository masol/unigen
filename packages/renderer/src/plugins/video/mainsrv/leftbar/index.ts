
import type { LeftSidebarItem } from "$lib/utils/plugin/extpoint/leftsidebar"
import EntityPanel from './entities/Entities.svelte'
import { InputManagerPanel } from './input-manager/index'
import OutputExplorer from './output-explorer/Explorer.svelte'
import ShotList from "./shot-list/ShotList.svelte"
import SettingPanel from './spec-setting/SettingsPanel.svelte'

const activities: LeftSidebarItem[] = [
    { id: 'input-manager', icon: "IconBook2", label: '输入管理', component: InputManagerPanel },
    { id: 'spec-setting', icon: "IconSparkles", label: '生成规格', component: SettingPanel },
    { id: 'shotlist', icon: "IconTable", label: '镜头表', component: ShotList },
    { id: 'entities', icon: "IconPhotoAi", label: '实体表', component: EntityPanel },
    { id: 'output-explorer', icon: "IconVideo", label: '输出', component: OutputExplorer, props: { id: 1 } },
]

export default activities;
