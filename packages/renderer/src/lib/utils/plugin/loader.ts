// src/lib/utils/pluginLoader.ts
//
// 插件模块加载器 —— 基于 SystemJS
// 纯工具类：三个职责 —— init / loadModule / unloadModule
// 不持有响应式状态，专为 PluginRuntimeManager / pluginStore 服务
//
// ⚠️ 本文件不依赖 PluginModule 类型，返回通用模块命名空间。
//    类型守卫由外部按需使用（见 pluginModuleGuard.ts）
//─────────────────────────────────────────────────────────

import log from 'electron-log/renderer'
import type { ModuleSource, ModuleFormat } from '@app/main/types'
import { BUILTIN_MODULES } from './shared/module'
import 'systemjs'


// ══════════════════════════ 类型 ══════════════════════════

/** 加载器返回的通用模块命名空间 */
export type ModuleNamespace = Record<string, unknown>

/** 依赖缺失异常 —— 用于触发递归加载 */
class MissingDependencyError extends Error {
    readonly depId: string
    constructor(depId: string) {
        super(`Missing dependency: ${depId}`)
        this.depId = depId
    }
}

/** 加载超时异常 */
class ModuleLoadTimeoutError extends Error {
    readonly pluginId: string
    constructor(pluginId: string, ms: number) {
        super(`[PluginLoader] loading "${pluginId}" timed out after ${ms}ms`)
        this.pluginId = pluginId
    }
}

// ══════════════════════════ SystemJS 最小类型声明 ══════════════════════════

interface SystemJSGlobal {
    set(id: string, ns: ModuleNamespace): void
    delete(id: string): boolean
    has(id: string): boolean
    get(id: string): ModuleNamespace | undefined
    import<T = ModuleNamespace>(id: string): Promise<T>
    addImportMap(map: { imports?: Record<string, string> }): void
    prepareImport(): Promise<void>
}

declare const System: SystemJSGlobal


// ══════════════════════════ 命名空间工具 ══════════════════════════

/**
 * 将任意模块对象包装为 SystemJS 兼容的命名空间
 *
 * SystemJS.set() 要求 Record<string, unknown>，且 CJS require()
 * 期望拿到可直接使用的对象。此函数统一处理三种输入形态：
 *
 * | 输入 | 示例 | 输出 |
 * |------|------|------|
 * | `import * as x`（命名空间对象） | `svelte` | 原样，补 `__esModule` |
 * | `import X from ...`（默认导出是对象） | `Logger` | `{ default: X, ...X, __esModule }` |
 * | `import X from ...`（默认导出是函数/原始值） | — | `{ default: X, __esModule }` |
 */
function asNamespace(mod: unknown): ModuleNamespace {
    if (mod !== null && typeof mod === 'object' && !Array.isArray(mod)) {
        const obj = mod as ModuleNamespace
        if ('__esModule' in obj) {
            return obj
        }
        return { ...obj, default: mod, __esModule: true }
    }
    return { default: mod, __esModule: true }
}


// ══════════════════════════ Promise 超时工具 ══════════════════════════

/**
 * 为 Promise 附加超时限制
 *
 * 超时后 reject ModuleLoadTimeoutError，原 Promise 继续执行但结果被忽略
 */
function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    pluginId: string,
): Promise<T> {
    if (ms <= 0 || !Number.isFinite(ms)) return promise

    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new ModuleLoadTimeoutError(pluginId, ms))
        }, ms)

        promise.then(
            (value) => { clearTimeout(timer); resolve(value) },
            (err) => { clearTimeout(timer); reject(err) },
        )
    })
}


// ══════════════════════════ 模拟 api() 调用 ══════════════════════════

/**
 * 模拟 api().module.load(pluginId)
 * TODO: 替换为 await api().module.load(pluginId)
 */
function fakeApiModuleLoad(pluginId: string): Promise<ModuleSource> {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (Math.random() < 0.15) {
                reject(new Error(`[Mock] Failed to fetch module source for "${pluginId}"`))
                return
            }

            resolve({
                format: 'cjs',
                code: `
                    'use strict';
                    const log = require('electron-log/renderer');
                    module.exports = {
                        register(container) {},
                        activate(container) {log.info("test")},
                        deactivate() {},
                    };
                `,
            })
        }, 200)
    })
}

// ══════════════════════════ 常量 ══════════════════════════

/** 递归依赖解析最大深度，防止循环依赖无限递归 */
const MAX_RESOLVE_DEPTH = 16

/** 单个模块的 require 重试上限 */
const MAX_REQUIRE_RETRIES = 32

/** 单模块加载超时（ms）—— 未来可改为运行时可配置 */
const MODULE_LOAD_TIMEOUT_MS = 3000

// ══════════════════════════ 加载器 ══════════════════════════
class ModuleLoader {
    // ── 唯一内部状态：并发去重 ──
    readonly #loading: Map<string, Promise<ModuleNamespace>> = new Map()

    // ══════════════════════════ 共享模块注册 ══════════════════════════

    /**
     * 将一个模块注册为共享模块，插件可通过 require(specifier) 获取
     *
     * 可在 init() 前后任意时刻调用（System 全局始终可用）
     *
     * @param specifier  插件代码中使用的 bare specifier，如 'lodash-es'
     * @param mod        真实模块对象（import 的结果）
     */
    addSharedModule(specifier: string, mod: unknown): void {
        System.set(specifier, asNamespace(mod))
        log.debug(`[PluginLoader] shared module registered: ${specifier}`)
    }

    // ══════════════════════════ 1. init ══════════════════════════

    /**
     * 初始化 SystemJS 环境
     *
     * - 将内置共享模块注入 SystemJS 注册表
     * - 配置 import map
     *
     * 初始化失败将阻止进入主系统（由外部守卫负责）
     */
    init(): void {
        for (const [specifier, mod] of Object.entries(BUILTIN_MODULES)) {
            this.addSharedModule(specifier, mod)
        }

        log.info(
            `[PluginLoader] initialized, ${Object.keys(BUILTIN_MODULES).length} built-in shared modules registered`,
        )
    }

    // ══════════════════════════ 2. loadModule ══════════════════════════

    /**
     * 加载单个模块并返回其命名空间
     *
     * 流程：
     *   SystemJS 注册表命中 → 直接返回
     *   并发去重 → 等待进行中的 Promise
     *   首次加载 → api() 取源码 → 按 format 求值 → System.set → 返回
     *
     * 返回通用 ModuleNamespace，调用方按需使用类型守卫做窄化
     *
     * @param pluginId 模块唯一标识
     * @param _depth 内部递归深度计数，外部调用不传
     */
    async loadModule(pluginId: string, _depth = 0): Promise<ModuleNamespace> {
        // ── SystemJS 注册表命中 ──
        const cached = System.get(pluginId)
        if (cached) {
            log.debug(`[PluginLoader] registry hit: ${pluginId}`)
            return cached
        }

        // ── 并发去重 ──
        const inflight = this.#loading.get(pluginId)
        if (inflight) {
            log.debug(`[PluginLoader] awaiting in-flight load: ${pluginId}`)
            return inflight
        }

        // ── 深度检查 ──
        if (_depth > MAX_RESOLVE_DEPTH) {
            throw new Error(
                `[PluginLoader] max dependency depth (${MAX_RESOLVE_DEPTH}) exceeded while loading "${pluginId}" — possible circular dependency`,
            )
        }

        // ── 首次加载（带超时） ──
        log.debug(`[PluginLoader] loadModule() called, pluginId=${pluginId}, depth=${_depth}`)

        const promise = withTimeout(
            this.#doLoad(pluginId, _depth),
            MODULE_LOAD_TIMEOUT_MS,
            pluginId,
        )
        this.#loading.set(pluginId, promise)

        try {
            return await promise
        } finally {
            this.#loading.delete(pluginId)
        }
    }

    // ══════════════════════════ 3. unloadModule ══════════════════════════

    /**
     * 卸载模块 —— 从 SystemJS 注册表中移除一切痕迹
     *
     * 幂等：未加载的 pluginId 静默返回
     */
    unloadModule(pluginId: string): void {
        log.debug(`[PluginLoader] unloadModule() called, pluginId=${pluginId}`)

        const existed = System.has(pluginId)
        System.delete(pluginId)

        if (existed) {
            log.info(`[PluginLoader] module unloaded: ${pluginId}`)
        } else {
            log.debug(`[PluginLoader] unloadModule() skipped — not in registry: ${pluginId}`)
        }
    }

    // ══════════════════════════ 内部辅助 ══════════════════════════

    /**
     * 核心加载流程
     */
    async #doLoad(pluginId: string, depth: number): Promise<ModuleNamespace> {
        // 1. 从 IPC 获取源码 + 格式
        // TODO: const source = await api().module.load(pluginId)
        const source = await fakeApiModuleLoad(pluginId)
        log.debug(`[PluginLoader] fetched source, format=${source.format}, pluginId=${pluginId}`)

        // 2. 按格式求值为模块命名空间
        const ns = await this.#evaluate(pluginId, source.code, source.format, depth)

        // 3. 注册到 SystemJS（供其它模块 require / System.import）
        // this.addSharedModule(pluginId, ns)
        System.set(pluginId, ns);

        log.info(`[PluginLoader] module loaded: ${pluginId}`)
        return ns
    }

    /**
     * 按模块格式分派求值
     */
    async #evaluate(
        pluginId: string,
        code: string,
        format: ModuleFormat,
        depth: number,
    ): Promise<ModuleNamespace> {
        switch (format) {
            case 'cjs':
            case 'umd':
                return await this.#evalCjsUmd(pluginId, code, depth)
            case 'system':
                return await this.#evalSystem(pluginId, code, depth)
            case 'esm':
                return await this.#evalEsm(code)
            default:
                throw new Error(
                    `[PluginLoader] unsupported module format "${format}" for "${pluginId}"`,
                )
        }
    }

    /**
     * CJS / UMD 求值
     *
     * 提供 require / module / exports 三件套
     * require 优先走 SystemJS 注册表（包含 init 注入的真实共享模块）
     * 命中未知模块时抛 MissingDependencyError → 外层递归加载后重试
     */
    async #evalCjsUmd(
        pluginId: string,
        code: string,
        depth: number,
    ): Promise<ModuleNamespace> {
        for (let attempt = 0; attempt < MAX_REQUIRE_RETRIES; attempt++) {
            try {
                const mod = { exports: {} as ModuleNamespace }

                const require = (depId: string): unknown => {
                    const ns = System.get(depId)
                    if (ns) {
                        if (ns.__esModule && 'default' in ns) {
                            return ns.default
                        }
                        return ns
                    }
                    throw new MissingDependencyError(depId)
                }

                // UMD 兼容：最小 AMD define
                let amdResult: ModuleNamespace | null = null
                const define = Object.assign(
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
                    (depsOrFactory: string[] | Function, factory?: Function) => {
                        if (typeof depsOrFactory === 'function') {
                            amdResult = depsOrFactory(require, mod.exports, mod) as ModuleNamespace
                        } else if (Array.isArray(depsOrFactory) && typeof factory === 'function') {
                            const resolved = depsOrFactory.map((d: string) => {
                                if (d === 'require') return require
                                if (d === 'module') return mod
                                if (d === 'exports') return mod.exports
                                return require(d)
                            })
                            amdResult = factory(...resolved) as ModuleNamespace
                        }
                    },
                    { amd: {} },
                )

                const fn = new Function('require', 'module', 'exports', 'define', code)
                fn(require, mod, mod.exports, define)

                const raw = Object.keys(mod.exports).length > 0
                    ? mod.exports
                    : amdResult ?? mod.exports

                return this.#normalizeNamespace(raw)
            } catch (err) {
                if (err instanceof MissingDependencyError) {
                    log.debug(
                        `[PluginLoader] "${pluginId}" requires missing dep "${err.depId}", ` +
                        `loading recursively (attempt ${attempt + 1})`,
                    )
                    await this.loadModule(err.depId, depth + 1)
                    continue
                }
                throw err
            }
        }

        throw new Error(
            `[PluginLoader] "${pluginId}" exceeded max require retries (${MAX_REQUIRE_RETRIES})`,
        )
    }

    /**
     * System.register 格式求值
     */
    async #evalSystem(
        pluginId: string,
        code: string,
        depth: number,
    ): Promise<ModuleNamespace> {
        const origRegister = System.constructor.prototype.register
        let captured = false

        const patchedRegister = function (
            this: SystemJSGlobal,
            ...args: unknown[]
        ) {
            if (typeof args[0] !== 'string' && !captured) {
                captured = true
                return origRegister.call(this, pluginId, ...args)
            }
            return origRegister.apply(this, args)
        }

        try {
            System.constructor.prototype.register = patchedRegister
            new Function(code)()
        } finally {
            System.constructor.prototype.register = origRegister
        }

        for (let attempt = 0; attempt < MAX_REQUIRE_RETRIES; attempt++) {
            try {
                return await System.import<ModuleNamespace>(pluginId)
            } catch (err) {
                const missingDep = this.#extractMissingDep(err)
                if (missingDep && attempt < MAX_REQUIRE_RETRIES - 1) {
                    log.debug(
                        `[PluginLoader] System.import("${pluginId}") missing dep "${missingDep}", ` +
                        `loading recursively`,
                    )
                    await this.loadModule(missingDep, depth + 1)
                    continue
                }
                throw err
            }
        }

        throw new Error(
            `[PluginLoader] System.import("${pluginId}") failed after ${MAX_REQUIRE_RETRIES} retries`,
        )
    }

    /**
     * ESM 格式求值（Blob URL + 原生 dynamic import）
     *
     * 注意：ESM 静态 import 无法拦截做递归加载
     * 建议后端优先发送 cjs / system 格式
     */
    async #evalEsm(code: string): Promise<ModuleNamespace> {
        const blob = new Blob([code], { type: 'application/javascript' })
        const url = URL.createObjectURL(blob)

        try {
            const ns = await (new Function('url', 'return import(url)'))(url) as ModuleNamespace
            return this.#normalizeNamespace(ns)
        } finally {
            URL.revokeObjectURL(url)
        }
    }

    /**
     * 确保返回值是命名空间对象
     */
    #normalizeNamespace(raw: unknown): ModuleNamespace {
        if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
            return raw as ModuleNamespace
        }
        return { default: raw }
    }

    /**
     * 从 SystemJS 抛出的错误中提取缺失模块 ID
     */
    #extractMissingDep(err: unknown): string | null {
        if (!(err instanceof Error)) return null

        const msg = err.message
        const patterns = [
            /unable to resolve.*?['"]([^'"]+)['"]/i,
            /Loading module.*?['"]([^'"]+)['"]/i,
            /resolve.*?['"]([^'"]+)['"]/i,
        ]

        for (const pattern of patterns) {
            const match = msg.match(pattern)
            if (match?.[1]) {
                const depId = match[1]
                if (!System.has(depId)) {
                    return depId
                }
            }
        }

        return null
    }
}

// ══════════════════════════ 单例导出 ══════════════════════════

export { ModuleLoadTimeoutError }
export const moduleLoader = new ModuleLoader()