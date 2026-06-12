// src/lib/store/plugin.svelte.ts
import evtbus from '$lib/utils/evtbus'
import log from 'electron-log/renderer'
// import { api } from '$lib/utils/api'
// import { loadPlugin, unloadPlugin } from '$lib/utils/plugin'

// ──────────────────────────类型 ──────────────────────────

/** 插件运行状态 */
type PluginStatus = 'enabled' | 'disabled' | 'error'

/** 已安装插件持久化元信息 */
interface InstalledPlugin {
    id: string
    name: string
    version: string
    description: string
    status: PluginStatus
    /** 插件级配置，结构由各插件自定义 */
    config: Record<string, unknown>
    /** 安装时间戳 */
    installedAt: number
    /** 最近一次状态变更时间戳 */
    statusChangedAt: number
    /** status === 'error' 时的错误摘要 */
    errorMessage?: string
}

// ────────────────────── 假数据工厂（待替换） ──────────────────────

function fakeLoadInstalledPlugins(): Promise<InstalledPlugin[]> {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve([
                {
                    id: 'plugin-markdown',
                    name: 'Markdown Renderer',
                    version: '1.2.0',
                    description: '渲染 Markdown 内容',
                    status: 'enabled',
                    config: {},
                    installedAt: Date.now() - 864_000_00,
                    statusChangedAt: Date.now() - 360_000_0,
                },
                {
                    id: 'plugin-theme-dark',
                    name: 'Dark Theme',
                    version: '2.1.0',
                    description: '深色主题',
                    status: 'enabled',
                    config: { accent: '#6366f1' },
                    installedAt: Date.now() - 172_800_000,
                    statusChangedAt: Date.now() - 172_800_000,
                },
                {
                    id: 'plugin-export-pdf',
                    name: 'PDF Export',
                    version: '0.9.1',
                    description: '导出 PDF 功能',
                    status: 'disabled',
                    config: {},
                    installedAt: Date.now() - 259_200_000,
                    statusChangedAt: Date.now() - 259_200_000,
                },
            ])
        }, 500)
    })
}

function fakeLoadDefaultPlugins(): Promise<InstalledPlugin[]> {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve([
                {
                    id: 'plugin-core',
                    name: 'Core Services',
                    version: '1.0.0',
                    description: '核心功能插件，不可禁用',
                    status: 'enabled' as PluginStatus,
                    config: {},
                    installedAt: Date.now(),
                    statusChangedAt: Date.now(),
                },
            ])
        }, 200)
    })
}

function fakePersistStatus(
    _pluginId: string,
    _status: PluginStatus,
): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 200)
    })
}

function fakePersistConfig(
    _pluginId: string,
    _config: Record<string, unknown>,
): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 150)
    })
}

function fakePersistUninstall(_pluginId: string): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 300)
    })
}

function fakePersistInstall(plugin: InstalledPlugin): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), 300)
    })
}

// ──────────────────────────── Store ────────────────────────────

class PluginStore {
    // ── 私有状态 ──

    /** 已安装插件列表；需push / splice /属性修改 → $state 深度响应 */
    #plugins = $state<InstalledPlugin[]>([])

    /** 异步三态 — init / 批量操作 */
    #isLoading = $state(false)
    #error = $state<string | null>(null)
    #lastUpdated = $state<number | null>(null)

    /** 是否已完成首次初始化 */
    #initialized = $state(false)

    /** 正在执行单插件操作的pluginId 集合；细粒度 mutation → $state */
    #busySet = $state<Set<string>>(new Set())

    // ── 只读门面 ──

    get plugins(): InstalledPlugin[] {
        return this.#plugins
    }
    get isLoading(): boolean {
        return this.#isLoading
    }
    get error(): string | null {
        return this.#error
    }
    get lastUpdated(): number | null {
        return this.#lastUpdated
    }
    get initialized(): boolean {
        return this.#initialized
    }

    // ── 派生 ──

    /** 已启用插件 */
    readonly enabledPlugins = $derived.by(() =>
        this.#plugins.filter((p) => p.status === 'enabled'),
    )

    /** 已禁用插件 */
    readonly disabledPlugins = $derived.by(() =>
        this.#plugins.filter((p) => p.status === 'disabled'),
    )

    /** 处于错误状态的插件 */
    readonly errorPlugins = $derived.by(() =>
        this.#plugins.filter((p) => p.status === 'error'),
    )

    /** 总数 */
    readonly totalCount = $derived(this.#plugins.length)

    /** 是否存在已安装插件 */
    readonly hasPlugins = $derived(this.#plugins.length > 0)

    /** 启用数*/
    readonly enabledCount = $derived.by(
        () => this.#plugins.filter((p) => p.status === 'enabled').length,
    )

    /** 是否有任何单插件操作正在进行 */
    readonly hasBusyPlugins = $derived(this.#busySet.size > 0)

    // ── 构造 ──

    constructor() {
        log.info('[PluginStore] initialized')

        // 监听全局重置（如用户退出登录 /恢复出厂）
        evtbus.on('plugin:reset', () => {
            log.debug('[PluginStore] received plugin:reset')
            this.#plugins = []
            this.#initialized = false
            this.#error = null
            this.#lastUpdated = null
            this.#busySet = new Set()
        })

        // 外部通知某插件已被安装（如由插件市场模块触发），store 被动收纳
        evtbus.on('plugin:installed', (plugin: InstalledPlugin) => {
            log.debug(`[PluginStore] received plugin:installed, id=${plugin.id}`)
            const exists = this.#plugins.some((p) => p.id === plugin.id)
            if (!exists) {
                this.#plugins.push(plugin)
                log.info(
                    `[PluginStore] plugin registered via event, id=${plugin.id}`,
                )
            }
        })

        // 外部通知配置变更（如插件自身保存设置后通知）
        evtbus.on(
            'plugin:config-changed',
            (payload: { pluginId: string; config: Record<string, unknown> }) => {
                log.debug(
                    `[PluginStore] received plugin:config-changed, pluginId=${payload.pluginId}`,
                )
                const target = this.#plugins.find((p) => p.id === payload.pluginId)
                if (target) {
                    target.config = payload.config
                }
            },
        )
    }

    // ── 内部辅助 ──

    #findPlugin(pluginId: string): InstalledPlugin | undefined {
        return this.#plugins.find((p) => p.id === pluginId)
    }

    #markBusy(pluginId: string): void {
        // 替换整个 Set 以触发响应（Set 内部 mutation 不触发 $state）
        const next = new Set(this.#busySet)
        next.add(pluginId)
        this.#busySet = next
    }

    #unmarkBusy(pluginId: string): void {
        const next = new Set(this.#busySet)
        next.delete(pluginId)
        this.#busySet = next
    }

    // ── Actions ──

    /**
     * 异步初始化：加载默认插件 + 从 IPC 读取已安装插件列表
     *幂等——重复调用不会重复加载
     */
    async init(): Promise<void> {
        if (this.#initialized) {
            log.debug('[PluginStore] init() skipped — already initialized')
            return
        }

        log.debug('[PluginStore] init() called')
        this.#isLoading = true
        this.#error = null

        try {
            // 1. 加载默认（内置）插件
            // TODO: const defaults = await api().plugin.loadDefaults()
            const defaults = await fakeLoadDefaultPlugins()

            // 2. 从 IPC 读取用户已安装的插件
            // TODO: const installed = await api().plugin.getInstalled()
            const installed = await fakeLoadInstalledPlugins()

            // 合并：默认插件兜底，用户已安装的覆盖同id 项
            const merged = new Map<string, InstalledPlugin>()
            for (const p of defaults) {
                merged.set(p.id, p)
            }
            for (const p of installed) {
                merged.set(p.id, p)
            }

            this.#plugins = Array.from(merged.values())
            this.#initialized = true
            this.#lastUpdated = Date.now()

            // 3. 依次通知 plugin工具加载已启用的插件运行时
            // TODO: for (const p of this.enabledPlugins) { await loadPlugin(p.id) }

            log.info(
                `[PluginStore] init complete — ${this.#plugins.length} plugins, ${this.enabledPlugins.length} enabled`,
            )
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err)
            log.error('[PluginStore] init() failed', err)
        } finally {
            this.#isLoading = false
        }
    }

    /**
     * 启用插件
     */
    async enable(pluginId: string): Promise<void> {
        log.debug(`[PluginStore] enable() called, pluginId=${pluginId}`)
        const plugin = this.#findPlugin(pluginId)
        if (!plugin) {
            log.error(`[PluginStore] enable() — plugin not found: ${pluginId}`)
            return
        }
        if (plugin.status === 'enabled') {
            log.debug(`[PluginStore] enable() skipped — already enabled: ${pluginId}`)
            return
        }

        this.#markBusy(pluginId)
        this.#error = null

        try {
            // 1. 持久化状态
            // TODO: await api().plugin.setStatus(pluginId, 'enabled')
            await fakePersistStatus(pluginId, 'enabled')

            // 2. 通知 plugin 工具加载运行时
            // TODO: await loadPlugin(pluginId)

            plugin.status = 'enabled'
            plugin.statusChangedAt = Date.now()
            plugin.errorMessage = undefined
            this.#lastUpdated = Date.now()

            log.info(`[PluginStore] plugin enabled: ${pluginId}`)
        } catch (err) {
            plugin.status = 'error'
            plugin.errorMessage = err instanceof Error ? err.message : String(err)
            this.#error = plugin.errorMessage
            log.error(`[PluginStore] enable() failed, pluginId=${pluginId}`, err)
        } finally {
            this.#unmarkBusy(pluginId)
        }
    }

    /**
     * 禁用插件
     */
    async disable(pluginId: string): Promise<void> {
        log.debug(`[PluginStore] disable() called, pluginId=${pluginId}`)
        const plugin = this.#findPlugin(pluginId)
        if (!plugin) {
            log.error(`[PluginStore] disable() — plugin not found: ${pluginId}`)
            return
        }
        if (plugin.status === 'disabled') {
            log.debug(
                `[PluginStore] disable() skipped — already disabled: ${pluginId}`,
            )
            return
        }

        this.#markBusy(pluginId)
        this.#error = null

        try {
            // 1. 持久化
            // TODO: await api().plugin.setStatus(pluginId, 'disabled')
            await fakePersistStatus(pluginId, 'disabled')

            // 2. 卸载运行时
            // TODO: await unloadPlugin(pluginId)

            plugin.status = 'disabled'
            plugin.statusChangedAt = Date.now()
            plugin.errorMessage = undefined
            this.#lastUpdated = Date.now()

            log.info(`[PluginStore] plugin disabled: ${pluginId}`)
        } catch (err) {
            plugin.status = 'error'
            plugin.errorMessage = err instanceof Error ? err.message : String(err)
            this.#error = plugin.errorMessage
            log.error(`[PluginStore] disable() failed, pluginId=${pluginId}`, err)
        } finally {
            this.#unmarkBusy(pluginId)
        }
    }

    /**
     * 切换启用 / 禁用
     */
    async toggleEnabled(pluginId: string): Promise<void> {
        const plugin = this.#findPlugin(pluginId)
        if (!plugin) return
        if (plugin.status === 'enabled') {
            await this.disable(pluginId)
        } else {
            await this.enable(pluginId)
        }
    }

    /**
     * 将一个可用插件纳入"已安装"管理（由外部选定后调用）
     */
    async install(meta: {
        id: string
        name: string
        version: string
        description: string
    }): Promise<void> {
        log.debug(`[PluginStore] install() called, pluginId=${meta.id}`)
        if (this.#findPlugin(meta.id)) {
            log.debug(`[PluginStore] install() skipped — already installed: ${meta.id}`)
            return
        }

        this.#markBusy(meta.id)
        this.#error = null

        try {
            const newPlugin: InstalledPlugin = {
                id: meta.id,
                name: meta.name,
                version: meta.version,
                description: meta.description,
                status: 'enabled',
                config: {},
                installedAt: Date.now(),
                statusChangedAt: Date.now(),
            }

            // 1. 持久化安装记录
            // TODO: await api().plugin.install(newPlugin)
            await fakePersistInstall(newPlugin)

            // 2. 加载运行时
            // TODO: await loadPlugin(meta.id)

            this.#plugins.push(newPlugin)
            this.#lastUpdated = Date.now()

            log.info(`[PluginStore] plugin installed: ${meta.id}`)
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err)
            log.error(`[PluginStore] install() failed, pluginId=${meta.id}`, err)
        } finally {
            this.#unmarkBusy(meta.id)
        }
    }

    /**
     * 卸载插件（从已安装列表移除）
     */
    async uninstall(pluginId: string): Promise<void> {
        log.debug(`[PluginStore] uninstall() called, pluginId=${pluginId}`)
        const idx = this.#plugins.findIndex((p) => p.id === pluginId)
        if (idx === -1) {
            log.error(`[PluginStore] uninstall() — plugin not found: ${pluginId}`)
            return
        }

        this.#markBusy(pluginId)
        this.#error = null

        try {
            // 1. 卸载运行时
            // TODO: await unloadPlugin(pluginId)

            // 2. 持久化删除
            // TODO: await api().plugin.uninstall(pluginId)
            await fakePersistUninstall(pluginId)

            this.#plugins.splice(idx, 1)
            this.#lastUpdated = Date.now()

            log.info(`[PluginStore] plugin uninstalled: ${pluginId}`)
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err)
            log.error(
                `[PluginStore] uninstall() failed, pluginId=${pluginId}`,
                err,
            )
        } finally {
            this.#unmarkBusy(pluginId)
        }
    }

    /**
     * 更新插件配置
     */
    async updateConfig(
        pluginId: string,
        config: Record<string, unknown>,
    ): Promise<void> {
        log.debug(`[PluginStore] updateConfig() called, pluginId=${pluginId}`)
        const plugin = this.#findPlugin(pluginId)
        if (!plugin) {
            log.error(
                `[PluginStore] updateConfig() — plugin not found: ${pluginId}`,
            )
            return
        }

        this.#markBusy(pluginId)
        this.#error = null

        try {
            // TODO: await api().plugin.updateConfig(pluginId, config)
            await fakePersistConfig(pluginId, config)

            plugin.config = config
            this.#lastUpdated = Date.now()

            log.info(`[PluginStore] config updated: ${pluginId}`)
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err)
            log.error(
                `[PluginStore] updateConfig() failed, pluginId=${pluginId}`,
                err,
            )
        } finally {
            this.#unmarkBusy(pluginId)
        }
    }

    /**
     * 查询某插件是否正在执行操作
     */
    isPluginBusy(pluginId: string): boolean {
        return this.#busySet.has(pluginId)
    }

    /**
     * 按id 获取单个插件（只读快照）
     */
    getPlugin(pluginId: string): InstalledPlugin | undefined {
        return this.#findPlugin(pluginId)
    }

    /**
     * 查询某插件是否已启用
     */
    isEnabled(pluginId: string): boolean {
        return this.#findPlugin(pluginId)?.status === 'enabled'
    }
}

export const pluginStore = new PluginStore()