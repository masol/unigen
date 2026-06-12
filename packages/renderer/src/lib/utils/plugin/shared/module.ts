//── 真实共享模块导入（Vite 打包阶段静态解析） ──
import * as svelte from 'svelte'
import * as svelteStore from 'svelte/store'
import { api } from '$lib/utils/api'
import evtbus from '$lib/utils/evtbus'
import Logger from 'electron-log/renderer'
import * as awilix from 'awilix'

// ══════════════════════════ 内置共享模块 ══════════════════════════

/**
 * 平台向插件暴露的内置共享模块
 *
 * key= 插件代码中 require() / import 使用的 bare specifier
 * value = 真实模块对象（Vite 构建时静态打入）
 *
 * 扩展方式：
 *1. 文件顶部 import 真实模块
 *   2. 在此处添加映射
 *   --或--
 *   外部调用 pluginLoader.addSharedModule(specifier, mod)
 */
export const BUILTIN_MODULES: Record<string, unknown> = {
    'svelte': svelte,
    'svelte/store': svelteStore,
    '$lib/utils/api': { api },       // 命名导出 →手动构造对象
    '$lib/utils/evtbus': evtbus,        // 默认导出
    'electron-log/renderer': Logger,        // 默认导出
    'awilix': awilix,        // 命名空间
}