// src/lib/store/layout.svelte.ts
// ═══════════════════════════════════════════════════════════════
//LayoutStore — 主窗口布局编排单例
//职责：Activity选中态· 三面板 开/关/最大化 · 可见性派生
//   所有操作均为同步状态切换，无异步 I/O，故不设isLoading/error/lastUpdated
// ═══════════════════════════════════════════════════════════════

import log from 'electron-log/renderer'
import {
    IconFiles,
    IconSearch,
    IconGitBranch,
    IconBug,
    IconPuzzle,
    IconSettings2,
    IconUserCircle,
} from "@tabler/icons-svelte";
// ─── 类型 ────────────────────────────────────────────────────

/** 三个可控面板位置 */
export type PanelPosition = 'left' | 'bottom' | 'right'

// ─── Store──────────────────────────────────────────────────

class LayoutStore {

    // ── Activity bar items ──
    readonly topActivities = [
        { id: "explorer", icon: IconFiles, label: "资源管理器" },
        { id: "search", icon: IconSearch, label: "搜索" },
        { id: "source-control", icon: IconGitBranch, label: "源代码管理" },
        { id: "debug", icon: IconBug, label: "运行和调试" },
        { id: "extensions", icon: IconPuzzle, label: "扩展" },
    ];

    readonly bottomActivities = [
        { id: "account", icon: IconUserCircle, label: "账户" },
        { id: "settings", icon: IconSettings2, label: "设置" },
    ];

    // ══════════════════════════════════════════════════════════
    //  面板开关（原始布尔值 → $state，无Proxy开销）
    // ══════════════════════════════════════════════════════════
    #isLeftOpen = $state(false)
    #isBottomOpen = $state(false)
    #isRightOpen = $state(false)

    get isLeftOpen(): boolean { return this.#isLeftOpen }
    get isBottomOpen(): boolean { return this.#isBottomOpen }
    get isRightOpen(): boolean { return this.#isRightOpen }

    // ══════════════════════════════════════════════════════════
    //  最大化面板（三态互斥 + null，原始值 → $state）
    // ══════════════════════════════════════════════════════════
    #maximizedPanel = $state<PanelPosition | null>(null)

    get maximizedPanel(): PanelPosition | null { return this.#maximizedPanel }

    // ══════════════════════════════════════════════════════════
    //  当前激活项（原始字符串 → $state）
    // ══════════════════════════════════════════════════════════
    #activeActivity = $state<string>('explorer')
    #bottomActiveTab = $state<string>('terminal')

    get activeActivity(): string { return this.#activeActivity }
    get bottomActiveTab(): string { return this.#bottomActiveTab }

    // ══════════════════════════════════════════════════════════
    //  派生 — 面板可见性（UI 模板直接绑定）
    // ══════════════════════════════════════════════════════════

    /** 左侧栏：自身打开，且未被其他面板最大化挤占 */
    readonly showLeft = $derived(
        this.#isLeftOpen && (this.#maximizedPanel === null || this.#maximizedPanel === 'left'),)

    /** 底部面板：自身打开，且未被其他面板最大化挤占 */
    readonly showBottom = $derived(
        this.#isBottomOpen && (this.#maximizedPanel === null || this.#maximizedPanel === 'bottom'),
    )

    /** 右侧栏：自身打开，且未被其他面板最大化挤占 */
    readonly showRight = $derived(
        this.#isRightOpen && (this.#maximizedPanel === null || this.#maximizedPanel === 'right'),
    )

    /** 主编辑区：无面板最大化时才显示 */
    readonly showMainEditor = $derived(this.#maximizedPanel === null)

    /** 是否有任意面板处于最大化 */
    readonly isAnyMaximized = $derived(this.#maximizedPanel !== null)

    // ══════════════════════════════════════════════════════════
    //  派生 — PaneGroup 重挂载 Key
    //  面板组合变化时，用新 key 强制 PaneGroup 销毁重建
    // ══════════════════════════════════════════════════════════

    readonly horizontalKey = $derived(
        `h-${this.#isLeftOpen}-${this.#isRightOpen}-${this.#maximizedPanel}`,
    )

    readonly verticalKey = $derived(
        `v-${this.#isBottomOpen}-${this.#maximizedPanel}`,
    )

    // ══════════════════════════════════════════════════════════
    //  构造
    // ══════════════════════════════════════════════════════════

    constructor() {
        log.info('[LayoutStore] initialized')
    }

    // ══════════════════════════════════════════════════════════
    //  Actions — Activity Bar
    // ══════════════════════════════════════════════════════════

    /**
     * 点击 Activity 条目：
     *  - 再次点击已激活项→ 折叠左侧栏
     *  - 点击其他项 → 切换并展开左侧栏，若其他面板最大化则退出最大化
     */
    handleActivityClick(id: string): void {
        log.debug(`[LayoutStore] handleActivityClick() id=${id}`)

        if (this.#activeActivity === id && this.#isLeftOpen) {
            this.#isLeftOpen = false
        } else {
            this.#activeActivity = id
            this.#isLeftOpen = true
            // 左侧栏展开时，若其他面板处于最大化，退出最大化
            if (this.#maximizedPanel !== null && this.#maximizedPanel !== 'left') {
                this.#maximizedPanel = null
            }
        }
    }

    /** 直接设置激活的Activity（不影响面板开关） */
    setActiveActivity(id: string): void {
        log.debug(`[LayoutStore] setActiveActivity() id=${id}`)
        this.#activeActivity = id
    }

    // ══════════════════════════════════════════════════════════
    //  Actions — Bottom Tab
    // ══════════════════════════════════════════════════════════

    setBottomActiveTab(tab: string): void {
        log.debug(`[LayoutStore] setBottomActiveTab() tab=${tab}`)
        this.#bottomActiveTab = tab
        // 切换 Tab 时确保底部面板可见
        if (!this.#isBottomOpen) {
            this.#isBottomOpen = true
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Actions — 面板开关 / 最大化 / 关闭
    // ══════════════════════════════════════════════════════════

    /** 切换面板开关，关闭时同步退出该面板的最大化 */
    togglePanel(panel: PanelPosition): void {
        log.debug(`[LayoutStore] togglePanel() panel=${panel}`)

        switch (panel) {
            case 'left':
                this.#isLeftOpen = !this.#isLeftOpen
                break
            case 'bottom':
                this.#isBottomOpen = !this.#isBottomOpen
                break
            case 'right':
                this.#isRightOpen = !this.#isRightOpen
                break
        }

        // 面板关闭 → 退出其最大化
        if (this.#maximizedPanel === panel) {
            this.#maximizedPanel = null
        }
    }

    /** 打开指定面板（幂等） */
    openPanel(panel: PanelPosition): void {
        log.debug(`[LayoutStore] openPanel() panel=${panel}`)

        switch (panel) {
            case 'left':
                this.#isLeftOpen = true
                break
            case 'bottom':
                this.#isBottomOpen = true
                break
            case 'right':
                this.#isRightOpen = true
                break
        }
    }

    /** 关闭指定面板，同步退出其最大化 */
    closePanel(panel: PanelPosition): void {
        log.debug(`[LayoutStore] closePanel() panel=${panel}`)

        switch (panel) {
            case 'left':
                this.#isLeftOpen = false
                break
            case 'bottom':
                this.#isBottomOpen = false
                break
            case 'right':
                this.#isRightOpen = false
                break
        }

        if (this.#maximizedPanel === panel) {
            this.#maximizedPanel = null
        }
    }

    /** 切换面板最大化 ↔ 还原 */
    toggleMaximizePanel(panel: PanelPosition): void {
        log.debug(`[LayoutStore] toggleMaximizePanel() panel=${panel}`)
        this.#maximizedPanel = this.#maximizedPanel === panel ? null : panel
    }

    /** 退出所有最大化 */
    exitMaximize(): void {
        log.debug('[LayoutStore] exitMaximize()')
        this.#maximizedPanel = null
    }

    // ══════════════════════════════════════════════════════════
    //  重置为默认布局
    // ══════════════════════════════════════════════════════════

    resetToDefaults(): void {
        this.#isLeftOpen = true
        this.#isBottomOpen = false
        this.#isRightOpen = false
        this.#maximizedPanel = null
        this.#activeActivity = 'explorer'
        this.#bottomActiveTab = 'terminal'
        log.info('[LayoutStore] reset to defaults')
    }
}

// ── 单例导出 ──
export const layoutStore = new LayoutStore()