// src/lib/store/plugin.svelte.ts
// import evtbus from '$lib/utils/evtbus'
import log from 'electron-log/renderer'
// import { api } from '$lib/utils/api'
import { pluginRuntime } from '$lib/utils/plugin'
import { BUILDIN_PLUGINS } from '$lib/utils/plugin/shared/plugin'
import type { PluginInfo, PluginScope, PluginStatus } from '@app/main/types'
import pMap from 'p-map'

// ══════════════════════════════════════════════════════════════
// 类型
// ══════════════════════════════════════════════════════════════

/**
 * Store 内部派生元数据——在 PluginInfo 基础上附加运行时状态
 * 组件直接消费此类型，无需关心底层 PluginInfo
 */
interface PluginMeta extends PluginInfo {
    /** status === 'error' 时的错误摘要 */
    errorMessage?: string
    /** 是否有操作正在进行（enable / disable / install / uninstall / reload） */
    busy: boolean
    /** 运行时是否已加载（scope 容器存活） */
    runtimeLoaded: boolean
    /** core 插件不可卸载 */
    readonly canUninstall: boolean
}

const MaxLoading = 6

// ══════════════════════════════════════════════════════════════
// 假数据工厂（待替换为 api() 调用）
// ══════════════════════════════════════════════════════════════

function fakeLoadSystemPlugins(): Promise<PluginInfo[]> {
    return new Promise((resolve) =>
        setTimeout(() => {
            resolve([
                {
                    id: 'plugin-markdown',
                    name: 'Markdown Renderer',
                    version: '1.2.0',
                    description: '渲染 Markdown 内容',
                    scope: 'system',
                    installed: true,
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
                    scope: 'system',
                    installed: true,
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
                    scope: 'system',
                    installed: true,
                    status: 'disabled',
                    config: {},
                    installedAt: Date.now() - 259_200_000,
                    statusChangedAt: Date.now() - 259_200_000,
                },
            ])
        }, 500),
    )
}

function fakePersistStatus(
    _id: string,
    _status: PluginStatus,
): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 200))
}

function fakePersistConfig(
    _id: string,
    _config: Record<string, unknown>,
): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 150))
}

function fakePersistUninstall(_id: string): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 300))
}

function fakePersistInstall(_info: PluginInfo): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 300))
}

// ══════════════════════════════════════════════════════════════
// 内部辅助：PluginInfo → 初始 PluginMeta
// ══════════════════════════════════════════════════════════════

function toMeta(info: PluginInfo): PluginMeta {
    return {
        ...info,
        busy: false,
        runtimeLoaded: false,
        get canUninstall() {
            return this.scope !== 'core'
        },
    }
}

// ══════════════════════════════════════════════════════════════
// Store
// ══════════════════════════════════════════════════════════════

class PluginStore {
    // ── 私有状态 ──────────────────────────────────────────────

    /**
     * pluginId → PluginMeta
     * Map 整体替换触发顶层响应；Meta 内字段逐个修改触发细粒度响应
     * 选 $state 深度响应：需要对 Meta 字段做 mutation（busy / status / …）
     */
    #metas = $state<Map<string, PluginMeta>>(new Map())

    /** 全局异步状态（init / loadProjectPlugins 等批量操作） */
    #isLoading = $state(false)
    #error = $state<string | null>(null)

    // ── 只读门面 ──────────────────────────────────────────────

    get isLoading(): boolean { return this.#isLoading }
    get error(): string | null { return this.#error }

    /**
     * 所有已知插件列表（含未安装）
     * 组件迭代此列表渲染插件管理界面
     */
    get all(): PluginMeta[] {
        return [...this.#metas.values()]
    }

    // ── 派生 ──────────────────────────────────────────────────

    /** 仅已安装的插件 */
    readonly installed = $derived.by(() =>
        [...this.#metas.values()].filter((p) => p.installed),
    )

    /** 已安装且已启用 */
    readonly enabled = $derived.by(() =>
        [...this.#metas.values()].filter((p) => p.installed && p.status === 'enabled'),
    )

    /** 已安装且已禁用 */
    readonly disabled = $derived.by(() =>
        [...this.#metas.values()].filter((p) => p.installed && p.status === 'disabled'),
    )

    /** 处于错误状态 */
    readonly errored = $derived.by(() =>
        [...this.#metas.values()].filter((p) => p.status === 'error'),
    )

    /** 按来源分组 */
    readonly corePlugins = $derived.by(() =>
        [...this.#metas.values()].filter((p) => p.scope === 'core'),
    )
    readonly systemPlugins = $derived.by(() =>
        [...this.#metas.values()].filter((p) => p.scope === 'system'),
    )
    readonly projectPlugins = $derived.by(() =>
        [...this.#metas.values()].filter((p) => p.scope === 'project'),
    )

    /** 是否有任何操作进行中 */
    readonly hasBusy = $derived.by(() =>
        [...this.#metas.values()].some((p) => p.busy),
    )

    readonly totalCount = $derived(this.#metas.size)
    readonly installedCount = $derived.by(() =>
        [...this.#metas.values()].filter((p) => p.installed).length,
    )
    readonly enabledCount = $derived.by(() =>
        [...this.#metas.values()].filter((p) => p.installed && p.status === 'enabled').length,
    )

    // ── 构造 ──────────────────────────────────────────────────

    constructor() {
        log.info('[PluginStore] initialized')

        // // 全局重置（退出登录 / 恢复出厂）
        // evtbus.on('plugin:reset', () => {
        //     log.debug('[PluginStore] received plugin:reset')
        //     this.#metas = new Map()
        //     this.#error = null
        // })

        // // 外部通知某插件已安装（插件市场等模块触发），被动收纳
        // evtbus.on('plugin:installed', (info: PluginInfo) => {
        //     log.debug(`[PluginStore] received plugin:installed, id=${info.id}`)
        //     if (!this.#metas.has(info.id)) {
        //         this.#metas.set(info.id, toMeta(info))
        //         // 触发 Map 顶层响应
        //         this.#metas = new Map(this.#metas)
        //         log.info(`[PluginStore] plugin registered via event, id=${info.id}`)
        //     }
        // })

        // // 外部通知配置变更
        // evtbus.on(
        //     'plugin:config-changed',
        //     (payload: { pluginId: string; config: Record<string, unknown> }) => {
        //         log.debug(
        //             `[PluginStore] received plugin:config-changed, pluginId=${payload.pluginId}`,
        //         )
        //         const meta = this.#metas.get(payload.pluginId)
        //         if (meta) {
        //             meta.config = payload.config
        //         }
        //     },
        // )
    }

    // ── 内部辅助 ──────────────────────────────────────────────

    #get(pluginId: string): PluginMeta | undefined {
        return this.#metas.get(pluginId)
    }

    /**
     * 注册一批 PluginInfo，已存在的 id 跳过（不覆盖运行时状态）
     * 批量写完后统一替换 Map 引用以触发顶层响应
     */
    #register(infos: PluginInfo[]): void {
        let dirty = false
        for (const info of infos) {
            if (!this.#metas.has(info.id)) {
                this.#metas.set(info.id, toMeta(info))
                dirty = true
            }
        }
        if (dirty) {
            this.#metas = new Map(this.#metas)
        }
    }

    /** 加载运行时并同步更新 meta 上的 runtimeLoaded / status / errorMessage */
    async #loadRuntime(meta: PluginMeta): Promise<boolean> {
        const result = await pluginRuntime.loadPlugin(meta.id)
        meta.runtimeLoaded = result.success
        if (!result.success) {
            meta.status = 'error'
            meta.errorMessage = result.errorMessage
            log.error(
                `[PluginStore] runtime load failed: ${meta.id}`,
                result.errorMessage,
            )
        }
        return result.success
    }

    /** 卸载运行时并同步更新 meta */
    async #unloadRuntime(meta: PluginMeta): Promise<boolean> {
        const result = await pluginRuntime.unloadPlugin(meta.id)
        meta.runtimeLoaded = false
        if (!result.success) {
            log.error(
                `[PluginStore] runtime unload failed: ${meta.id}`,
                result.errorMessage,
            )
        }
        return result.success
    }

    // ── Actions ───────────────────────────────────────────────

    /**
     * 全局初始化
     *
     * 1. 初始化 pluginRuntime（注入平台服务、启动 loader）
     * 2. 注册 BUILTIN_PLUGINS（core），并发激活运行时
     * 3. 通过 API 获取系统级插件，注册并激活已启用项
     *
     * 由应用启动流程统一调用一次（外部 guard 保证幂等）
     */
    async init(): Promise<void> {
        log.debug('[PluginStore] init() called')
        this.#isLoading = true
        this.#error = null

        try {
            // Step 1：初始化运行时容器
            pluginRuntime.init()

            // Step 2：注册并激活 core 插件
            this.#register(BUILDIN_PLUGINS)

            const coreMetas = [...this.#metas.values()].filter(
                (p) => p.scope === 'core' && p.installed && p.status === 'enabled',
            )
            // await Promise.all(coreMetas.map((m) => this.#loadRuntime(m)))
            await pMap(
                coreMetas,
                (m) => this.#loadRuntime(m),
                { concurrency: MaxLoading }
            )

            log.info(`[PluginStore] core plugins loaded — ${coreMetas.length} item(s)`)

            // Step 3：获取系统级插件
            // TODO: const systemInfos = await api().plugin.getSystemInstalled()
            const systemInfos = await fakeLoadSystemPlugins()
            this.#register(systemInfos)

            const systemEnabledMetas = systemInfos
                .filter((p) => p.installed && p.status === 'enabled')
                .map((p) => this.#metas.get(p.id)!)
                .filter(Boolean)

            await Promise.all(systemEnabledMetas.map((m) => this.#loadRuntime(m)))

            log.info(
                `[PluginStore] init complete — total=${this.#metas.size}, ` +
                `enabled=${this.enabledCount}`,
            )
            // } catch (err) {  // 不能拦截错误，否则外部初始化失败不进入主界面的guard被跳过了。
            //     this.#error = err instanceof Error ? err.message : String(err)
            //     log.error('[PluginStore] init() failed', err)
        } finally {
            this.#isLoading = false
        }
    }

    /**
     * 加载项目级插件（由 projectStore 在项目打开时调用）
     *
     * @param infos 项目配置中声明的插件完整信息（scope 应为 'project'）
     *
     * 流程：
     *   - 注册尚未在列表中的插件（scope 强制为 'project'）
     *   - 对所有 enabled 且运行时未加载的项目插件激活运行时
     */
    async loadProjectPlugins(infos: PluginInfo[]): Promise<void> {
        if (infos.length === 0) return
        log.debug(
            `[PluginStore] loadProjectPlugins() called, count=${infos.length}`,
        )

        this.#isLoading = true
        this.#error = null

        try {
            // 强制 scope = 'project'，防止项目配置越权声明 core / system
            const normalized = infos.map((p) => ({ ...p, scope: 'project' as PluginScope }))
            this.#register(normalized)

            const toLoad = normalized
                .filter((p) => p.installed && p.status === 'enabled')
                .map((p) => this.#metas.get(p.id)!)
                .filter((m) => m && !m.runtimeLoaded)

            const results = await Promise.all(toLoad.map((m) => this.#loadRuntime(m)))
            const successCount = results.filter(Boolean).length

            log.info(
                `[PluginStore] project plugins loaded — requested=${infos.length}, ` +
                `activated=${successCount}`,
            )
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err)
            log.error('[PluginStore] loadProjectPlugins() failed', err)
        } finally {
            this.#isLoading = false
        }
    }

    /**
     * 卸载所有项目级插件运行时（由 projectStore 在项目关闭时调用）
     * 不从列表中移除，仅停用运行时，保留 meta 供界面展示
     */
    async unloadProjectPlugins(): Promise<void> {
        log.debug('[PluginStore] unloadProjectPlugins() called')

        const projectMetas = [...this.#metas.values()].filter(
            (p) => p.scope === 'project' && p.runtimeLoaded,
        )

        await Promise.all(projectMetas.map((m) => this.#unloadRuntime(m)))

        log.info(
            `[PluginStore] project plugins unloaded — ${projectMetas.length} item(s)`,
        )
    }

    /**
     * 启用插件：持久化 → 加载运行时
     */
    async enable(pluginId: string): Promise<void> {
        log.debug(`[PluginStore] enable() called, pluginId=${pluginId}`)
        const meta = this.#get(pluginId)
        if (!meta) {
            log.error(`[PluginStore] enable() — plugin not found: ${pluginId}`)
            return
        }
        if (meta.status === 'enabled') {
            log.debug(`[PluginStore] enable() skipped — already enabled: ${pluginId}`)
            return
        }

        meta.busy = true
        this.#error = null

        try {
            // TODO: await api().plugin.setStatus(pluginId, 'enabled')
            await fakePersistStatus(pluginId, 'enabled')

            const ok = await this.#loadRuntime(meta)
            if (!ok) {
                throw new Error(meta.errorMessage ?? `Runtime load failed: ${pluginId}`)
            }

            meta.status = 'enabled'
            meta.statusChangedAt = Date.now()
            meta.errorMessage = undefined

            log.info(`[PluginStore] plugin enabled: ${pluginId}`)
        } catch (err) {
            meta.status = 'error'
            meta.errorMessage = err instanceof Error ? err.message : String(err)
            this.#error = meta.errorMessage
            log.error(`[PluginStore] enable() failed, pluginId=${pluginId}`, err)
        } finally {
            meta.busy = false
        }
    }

    /**
     * 禁用插件：卸载运行时 → 持久化
     */
    async disable(pluginId: string): Promise<void> {
        log.debug(`[PluginStore] disable() called, pluginId=${pluginId}`)
        const meta = this.#get(pluginId)
        if (!meta) {
            log.error(`[PluginStore] disable() — plugin not found: ${pluginId}`)
            return
        }
        if (meta.status === 'disabled') {
            log.debug(`[PluginStore] disable() skipped — already disabled: ${pluginId}`)
            return
        }

        meta.busy = true
        this.#error = null

        try {
            await this.#unloadRuntime(meta)

            // TODO: await api().plugin.setStatus(pluginId, 'disabled')
            await fakePersistStatus(pluginId, 'disabled')

            meta.status = 'disabled'
            meta.statusChangedAt = Date.now()
            meta.errorMessage = undefined

            log.info(`[PluginStore] plugin disabled: ${pluginId}`)
        } catch (err) {
            meta.status = 'error'
            meta.errorMessage = err instanceof Error ? err.message : String(err)
            this.#error = meta.errorMessage
            log.error(`[PluginStore] disable() failed, pluginId=${pluginId}`, err)
        } finally {
            meta.busy = false
        }
    }

    /**
     * 切换启用 / 禁用
     */
    async toggleEnabled(pluginId: string): Promise<void> {
        const meta = this.#get(pluginId)
        if (!meta) return
        if (meta.status === 'enabled') {
            await this.disable(pluginId)
        } else {
            await this.enable(pluginId)
        }
    }

    /**
     * 安装插件（将 installed=false 的条目标记为已安装，或新增后安装）
     */
    async install(info: PluginInfo): Promise<void> {
        log.debug(`[PluginStore] install() called, pluginId=${info.id}`)

        // 已在列表中且已安装，跳过
        const existing = this.#get(info.id)
        if (existing?.installed) {
            log.debug(`[PluginStore] install() skipped — already installed: ${info.id}`)
            return
        }

        // 未在列表中则先注册
        if (!existing) {
            this.#register([info])
        }

        const meta = this.#metas.get(info.id)!
        meta.busy = true
        this.#error = null

        try {
            const installInfo: PluginInfo = {
                ...info,
                installed: true,
                status: 'enabled',
                installedAt: Date.now(),
                statusChangedAt: Date.now(),
            }

            // TODO: await api().plugin.install(installInfo)
            await fakePersistInstall(installInfo)

            // 加载运行时
            const ok = await this.#loadRuntime(meta)

            // 无论运行时成功与否都标记已安装，失败时状态为 error
            Object.assign(meta, {
                installed: true,
                status: ok ? ('enabled' as PluginStatus) : ('error' as PluginStatus),
                installedAt: installInfo.installedAt,
                statusChangedAt: installInfo.statusChangedAt,
                errorMessage: ok ? undefined : meta.errorMessage,
            })

            log.info(`[PluginStore] plugin installed: ${info.id}`)
        } catch (err) {
            meta.status = 'error'
            meta.errorMessage = err instanceof Error ? err.message : String(err)
            this.#error = meta.errorMessage
            log.error(`[PluginStore] install() failed, pluginId=${info.id}`, err)
        } finally {
            meta.busy = false
        }
    }

    /**
     * 卸载插件：仅允许 scope !== 'core'
     * 卸载后将 meta.installed 置为 false（保留条目，供界面"可用插件"展示）
     */
    async uninstall(pluginId: string): Promise<void> {
        log.debug(`[PluginStore] uninstall() called, pluginId=${pluginId}`)
        const meta = this.#get(pluginId)
        if (!meta) {
            log.error(`[PluginStore] uninstall() — plugin not found: ${pluginId}`)
            return
        }
        if (!meta.canUninstall) {
            log.error(`[PluginStore] uninstall() — core plugin cannot be uninstalled: ${pluginId}`)
            return
        }

        meta.busy = true
        this.#error = null

        try {
            // 1. 卸载运行时
            await this.#unloadRuntime(meta)

            // 2. 持久化删除
            // TODO: await api().plugin.uninstall(pluginId)
            await fakePersistUninstall(pluginId)

            // 保留 meta 条目，但标记未安装
            meta.installed = false
            meta.status = 'disabled'
            meta.errorMessage = undefined
            meta.installedAt = null
            meta.statusChangedAt = Date.now()

            log.info(`[PluginStore] plugin uninstalled: ${pluginId}`)
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err)
            log.error(`[PluginStore] uninstall() failed, pluginId=${pluginId}`, err)
        } finally {
            meta.busy = false
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
        const meta = this.#get(pluginId)
        if (!meta) {
            log.error(`[PluginStore] updateConfig() — plugin not found: ${pluginId}`)
            return
        }

        meta.busy = true
        this.#error = null

        try {
            // TODO: await api().plugin.updateConfig(pluginId, config)
            await fakePersistConfig(pluginId, config)

            meta.config = config

            log.info(`[PluginStore] config updated: ${pluginId}`)
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err)
            log.error(`[PluginStore] updateConfig() failed, pluginId=${pluginId}`, err)
        } finally {
            meta.busy = false
        }
    }

    /**
     * 热重载插件（开发 / 调试场景）
     */
    async reload(pluginId: string): Promise<void> {
        log.debug(`[PluginStore] reload() called, pluginId=${pluginId}`)
        const meta = this.#get(pluginId)
        if (!meta) {
            log.error(`[PluginStore] reload() — plugin not found: ${pluginId}`)
            return
        }

        meta.busy = true
        this.#error = null

        try {
            const result = await pluginRuntime.reloadPlugin(pluginId)
            if (!result.success) {
                throw new Error(result.errorMessage ?? `Reload failed: ${pluginId}`)
            }

            meta.runtimeLoaded = true
            meta.status = 'enabled'
            meta.statusChangedAt = Date.now()
            meta.errorMessage = undefined

            log.info(`[PluginStore] plugin reloaded: ${pluginId}`)
        } catch (err) {
            meta.status = 'error'
            meta.errorMessage = err instanceof Error ? err.message : String(err)
            this.#error = meta.errorMessage
            log.error(`[PluginStore] reload() failed, pluginId=${pluginId}`, err)
        } finally {
            meta.busy = false
        }
    }

    /**
     * 应用退出前全量卸载（由应用生命周期管理器调用）
     */
    async disposeAll(): Promise<void> {
        log.debug('[PluginStore] disposeAll() called')
        const results = await pluginRuntime.disposeAll()
        const failedCount = results.filter((r) => !r.success).length
        if (failedCount > 0) {
            log.error(
                `[PluginStore] disposeAll() — ${failedCount} plugin(s) failed`,
                results.filter((r) => !r.success).map((r) => r.pluginId),
            )
        }
        log.info('[PluginStore] all plugins disposed')
    }

    // ── 只读查询 ──────────────────────────────────────────────

    /** 获取单个插件 meta（含响应式状态，组件直接绑定） */
    getPlugin(pluginId: string): PluginMeta | undefined {
        return this.#get(pluginId)
    }

    /** 查询某插件是否已启用 */
    isEnabled(pluginId: string): boolean {
        return this.#get(pluginId)?.status === 'enabled'
    }
}

export const pluginStore = new PluginStore()