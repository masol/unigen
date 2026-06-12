// src/lib/utils/plugin.ts
//
//插件运行时管理器—— 基于 Awilix DI 容器（scoped 隔离）
//纯工具类，不持有任何响应式状态，专为pluginStore 服务
//─────────────────────────────────────────────────────────────

import type { PluginModule } from '$lib/types/plugin'
import {
    createContainer,
    asValue,
    type AwilixContainer,
    InjectionMode,
} from 'awilix'
import log from 'electron-log/renderer'

// ══════════════════════════ 公开类型（待移至 type文件） ══════════════════════════

/** 单次操作的反馈，供 pluginStore 据此更新状态 */
export interface PluginLoadResult {
    pluginId: string
    success: boolean
    errorMessage?: string
}

// ══════════════════════════ 内部类型 ══════════════════════════

/** 已成功加载的插件运行时信息 */
interface PluginRuntime {
    readonly module: PluginModule
    readonly scope: AwilixContainer // 该插件的隔离子容器
}

// ══════════════════════════ 运行时管理器 ══════════════════════════

class PluginRuntimeManager {
    /** 根容器 —— 仅存放平台级服务，插件不直接注册到此 */
    readonly #root: AwilixContainer

    /** pluginId → 运行时（仅成功加载的插件） */
    readonly #runtimes = new Map<string, PluginRuntime>()

    constructor() {
        this.#root = createContainer({
            injectionMode: InjectionMode.PROXY,
            strict: true,
        })
        log.info('[PluginRuntime] root container created')
    }

    // ── 查询（无副作用） ──────────────────────────────────────

    /** 插件是否已加载到运行时 */
    isLoaded(pluginId: string): boolean {
        return this.#runtimes.has(pluginId)
    }

    /** 当前所有已加载的 pluginId */
    getLoadedIds(): string[] {
        return [...this.#runtimes.keys()]
    }

    /** 获取插件模块实例（未加载返回 undefined） */
    getModule(pluginId: string): PluginModule | undefined {
        return this.#runtimes.get(pluginId)?.module
    }

    /** 获取插件的隔离容器（未加载返回 undefined） */
    getScope(pluginId: string): AwilixContainer | undefined {
        return this.#runtimes.get(pluginId)?.scope
    }

    /**
     * 从指定插件的 scoped 容器中解析服务
     * @throws插件未加载 或 服务未注册 时抛出
     */
    resolve<T = unknown>(pluginId: string, name: string): T {
        const scope = this.#runtimes.get(pluginId)?.scope
        if (!scope) {
            throw new Error(`[PluginRuntime] cannot resolve "${name}" — plugin not loaded: ${pluginId}`)
        }
        return scope.resolve<T>(name)
    }

    /** 指定插件的容器中是否注册了指定 key */
    hasRegistration(pluginId: string, name: string): boolean {
        return this.#runtimes.get(pluginId)?.scope.hasRegistration(name) ?? false
    }

    // ── 核心操作 ──────────────────────────────────────────────

    /**
     * 加载并激活单个插件
     *
     * 流程：createScope → register → activate →存入map
     * 幂等：已加载的插件直接返回 success
     *
     * @param pluginId  永久唯一的插件标识
     * @param module    由外部 loader 加载好的插件模块
     *  TODO: 将来由 ./loader 的 loadPlugin(pluginId) 获取
     */
    async loadPlugin(pluginId: string, module: PluginModule): Promise<PluginLoadResult> {
        if (this.#runtimes.has(pluginId)) {
            log.debug(`[PluginRuntime] already loaded, skip: ${pluginId}`)
            return { pluginId, success: true }
        }

        // 为该插件创建隔离的 scoped 子容器
        // scope 可resolve 根容器的平台服务，但注册互不干扰
        const scope = this.#root.createScope()

        try {
            // register阶段：插件向自己的 scope 注册服务
            await module.register(scope)

            // activate 阶段（可选）：scope 内所有依赖已就绪
            if (module.activate) {
                await module.activate(scope)
            }

            this.#runtimes.set(pluginId, { module, scope })
            log.info(`[PluginRuntime] loaded: ${pluginId}`)
            return { pluginId, success: true }
        } catch (err) {
            // 失败时销毁 scope，不留残余
            await this.#disposeScope(scope)
            const errorMessage = err instanceof Error ? err.message : String(err)
            log.error(`[PluginRuntime] load failed: ${pluginId}`, err)
            return { pluginId, success: false, errorMessage }
        }
    }

    /**
     * 停用并卸载单个插件
     *
     * 流程：deactivate → dispose scope → 移除 map
     * 幂等：未加载的插件直接返回 success
     */
    async unloadPlugin(pluginId: string): Promise<PluginLoadResult> {
        const runtime = this.#runtimes.get(pluginId)
        if (!runtime) {
            log.debug(`[PluginRuntime] not loaded, skip unload: ${pluginId}`)
            return { pluginId, success: true }
        }

        try {
            if (runtime.module.deactivate) {
                await runtime.module.deactivate()
            }
            await this.#disposeScope(runtime.scope)
            this.#runtimes.delete(pluginId)
            log.info(`[PluginRuntime] unloaded: ${pluginId}`)
            return { pluginId, success: true }
        } catch (err) {
            // 即便出错也强制移除，防止僵尸状态
            this.#runtimes.delete(pluginId)
            await this.#disposeScope(runtime.scope)
            const errorMessage = err instanceof Error ? err.message : String(err)
            log.error(`[PluginRuntime] unload failed: ${pluginId}`, err)
            return { pluginId, success: false, errorMessage }
        }
    }

    /**
     * 卸载后重新加载（热重载场景）
     * @param module 重新由 loader 加载的模块（可能是新版本）
     */
    async reloadPlugin(pluginId: string, module: PluginModule): Promise<PluginLoadResult> {
        const unloadResult = await this.unloadPlugin(pluginId)
        if (!unloadResult.success) {
            return unloadResult
        }
        return this.loadPlugin(pluginId, module)
    }

    /**
     * 全部卸载 —— 逆序卸载（先加载的后卸载，减少依赖冲突）
     *最后销毁根容器自身
     */
    async disposeAll(): Promise<PluginLoadResult[]> {
        log.debug('[PluginRuntime] disposeAll()')

        const ids = [...this.#runtimes.keys()].reverse()
        const results: PluginLoadResult[] = []

        for (const id of ids) {
            results.push(await this.unloadPlugin(id))
        }

        // 销毁根容器
        await this.#root.dispose()

        const failed = results.filter((r) => !r.success).length
        log.info(`[PluginRuntime] disposed all — ${results.length} total, ${failed} failed`)
        return results
    }

    /**
     * 向根容器注入平台级服务（由 pluginStore 在 init 时调用）
     * 所有插件的scope 可通过 container.resolve(name) 访问
     */
    registerPlatformService(name: string, value: unknown): void {
        this.#root.register(name, asValue(value))
        log.debug(`[PluginRuntime] platform service registered: ${name}`)
    }

    // ── 内部辅助 ──────────────────────────────────────────────

    /** 安全销毁 scope，静默吞错 */
    async #disposeScope(scope: AwilixContainer): Promise<void> {
        try {
            await scope.dispose()
        } catch (err) {
            log.warn('[PluginRuntime] scope dispose error (ignored)', err)
        }
    }
}

// ══════════════════════════ 单例导出 ══════════════════════════

export const pluginRuntime = new PluginRuntimeManager()