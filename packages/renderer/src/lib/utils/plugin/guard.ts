// src/lib/utils/pluginModuleGuard.ts
//
// PluginModule 类型守卫 —— 将 pluginLoader 返回的通用命名空间
// 窄化为类型安全的 PluginModule
//─────────────────────────────────────────────────────────

import type { PluginModule } from '$lib/types/plugin'
import type { ModuleNamespace } from './loader'

/**
 * 从模块命名空间中提取并验证 PluginModule 契约
 *
 * 检查规则：
 * - 优先取 default 导出，若无则取命名空间本身
 * - 必须包含 register() 函数（PluginModule 最低契约）
 *
 * @example
 *   const ns = await pluginLoader.loadModule('my-plugin')
 *   const pluginModule = asPluginModule(ns)
 *   if (pluginModule) {
 *     pluginModule.register(container)
 *   }
 *
 * @example 断言式用法（确定一定是插件）
 *   const pluginModule = assertPluginModule(ns, 'my-plugin')
 *   pluginModule.register(container)
 */
export function isPluginModule(ns: ModuleNamespace): boolean {
    const candidate = extractCandidate(ns)
    return (
        candidate !== null &&
        typeof candidate === 'object' &&
        typeof (candidate as Record<string, unknown>).register === 'function'
    )
}

/**
 * 尝试从命名空间中提取 PluginModule，失败返回 null
 */
export function asPluginModule(ns: ModuleNamespace): PluginModule | null {
    const candidate = extractCandidate(ns)
    if (
        candidate !== null &&
        typeof candidate === 'object' &&
        typeof (candidate as Record<string, unknown>).register === 'function'
    ) {
        return candidate as unknown as PluginModule
    }
    return null
}

/**
 * 断言式提取 —— 失败直接抛异常
 *
 * 适用于确定模块必须是插件的场景（如 pluginStore 内部调用）
 */
export function assertPluginModule(ns: ModuleNamespace, pluginId: string): PluginModule {
    const result = asPluginModule(ns)
    if (!result) {
        throw new Error(
            `[pluginModuleGuard] module "${pluginId}" does not conform to PluginModule contract (missing register() function)`,
        )
    }
    return result
}

// ── 内部辅助 ──

function extractCandidate(ns: ModuleNamespace): unknown {
    // ESM default export 优先
    if ('default' in ns && ns.default !== undefined) {
        return ns.default
    }
    // 回退到命名空间自身（CJS module.exports 直接挂载的情况）
    return ns
}