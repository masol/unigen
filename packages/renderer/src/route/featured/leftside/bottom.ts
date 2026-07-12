
import type { LeftSidebarItem } from "$lib/utils/plugin/extpoint/leftsidebar"
import Fallback from "./fallback.svelte"
import SettingHeader from './setting.header.svelte'
import SettingPanel from './setting.svelte'

// import { InputManagerPanel } from "../../../plugins/video/mainsrv/leftbar/input-manager/index"

const bottomActivities: LeftSidebarItem[] = [
    { id: 'account', icon: "IconUserCircle", label: '账户', component: Fallback, header: null },
    { id: 'settings', icon: "IconSettings", label: '设置', component: SettingPanel, header: SettingHeader },
    // { id: 'InputManagerPanel', icon: IconUserCircle as unknown as Component<any>, label: '输入管理', component: InputManagerPanel, header: null },

]

export default bottomActivities;