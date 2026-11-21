// packages/renderer/src/lib/utils/commands/appearance.ts
import { bottomPanelStore } from "$lib/store/local/bottombar.store.svelte";
import { rightPanelStore } from "$lib/store/local/rightbar.store.svelte";
import { layoutStore } from "$lib/store/ui/layout.svelte";


/**
 * 外观类的面板开关命令。
 *
 * 这些命令本质上属于"开发者调试 UI"：
 * 面板的存在仅在 showDevUI 开启时有实际意义，因此统一标记 devOnly。
 * - showDevUI === false 时：命令面板 / 快捷键设置中隐藏；
 * - 若用户主动绑定过热键：仍可通过热键触发底层 togglePanel（handler 不变）。
 * - 主进程默认不为其绑定任何热键。
 */
export const AppearanceBuildin = [
    {
        id: 'appearance.togglerightbar',
        label: '切换右侧栏',
        category: 'Appearance',
        devOnly: true,
        handler: () => {
            layoutStore.togglePanel("right")
        },
    },
    {
        id: 'appearance.togglebottom',
        label: '切换下侧栏',
        category: 'Appearance',
        devOnly: true,
        handler: () => {
            layoutStore.togglePanel("bottom")
        },
    },
    {
        id: 'appearance.toggleleft',
        label: '切换左侧栏',
        category: 'Appearance',
        devOnly: true,
        handler: () => {
            layoutStore.togglePanel("left")
        },
    },
    {
        id: 'appearance.showBlueprint',
        label: '显示蓝图',
        category: 'Appearance',
        devOnly: true,
        handler: () => {
            layoutStore.openPanel('right');
            rightPanelStore.activeTab = "blueprint"
        },
    },
    {
        id: 'appearance.showSystemLog',
        label: '显示日志',
        category: 'Appearance',
        devOnly: true,
        handler: () => {
            layoutStore.openPanel('bottom');
            bottomPanelStore.setActiveTab("logger")
        },
    },
    {
        id: 'appearance.showDAG',
        label: '显示DAG',
        category: 'Appearance',
        devOnly: true,
        handler: () => {
            layoutStore.openPanel('bottom');
            bottomPanelStore.setActiveTab("dag")
        },
    },
]