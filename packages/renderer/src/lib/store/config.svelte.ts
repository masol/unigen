// src/lib/store/config.svelte.ts
import evtbus from '$lib/utils/evtbus'
import log from 'electron-log/renderer'
import type { AppConfig, Provider } from '@app/main/types'
import { api } from '$lib/utils/api'
import { setMode } from "mode-watcher";

// ── Store ──

class ConfigStore {
    // ── 私有状态：配置项 ──
    #theme = $state<AppConfig['theme']>('system') // 原始值（三选一枚举） → $state
    #lang = $state<string>('zh-CN')              // 原始值 → $state
    #modelEndpoint = $state<string>('')                   // 原始值 → $state
    #embedModel = $state<string>('')                   // 原始值 → $state
    #localModel = $state<string>('')                   // 原始值 → $state
    #providers = $state.raw<Provider[]>([])           // 复合对象整体替换 → $state.raw
    #autoupdate = $state<boolean>(true)

    // ── 私有状态：init 异步状态机 ──
    #isLoading = $state(false)
    #error = $state<string | null>(null)

    // ── 私有状态：save 异步状态机（并发安全计数器） ──
    #savingCount = $state(0)                               // 原始值 → $state
    #saveError = $state<string | null>(null)
    #lastSaved = $state<number | null>(null)

    // ── 只读门面：配置项 ──
    get theme() { return this.#theme }
    get lang() { return this.#lang }
    get modelEndpoint() { return this.#modelEndpoint }
    get embedModel() { return this.#embedModel }
    get localModel() { return this.#localModel }
    get providers() { return this.#providers }
    get autoupdate() { return this.#autoupdate }

    // ── 只读门面：init 异步状态 ──
    get isLoading() { return this.#isLoading }
    get error() { return this.#error }

    // ── 只读门面：save 异步状态 ──
    get isSaving() { return this.#savingCount > 0 }
    get saveError() { return this.#saveError }
    get lastSaved() { return this.#lastSaved }

    // ── 派生 ──
    /** 当前是否暗色主题（不含 system，仅精确匹配 'dark'） */
    readonly isDark = $derived(this.#theme === 'dark')

    /** 是否已配置至少一个 Provider */
    readonly hasProviders = $derived(this.#providers.length > 0)

    /** Provider 总数 */
    readonly providerCount = $derived(this.#providers.length)

    /** 所有 Provider 下 Model 总数 */
    readonly totalModelCount = $derived.by(() =>
        this.#providers.reduce((sum, p) => sum + p.models.length, 0),
    )

    /** embed_model 是否指向外部服务 */
    readonly isExternalEmbed = $derived(this.#embedModel.startsWith('external:'))

    constructor() {
        log.info('[ConfigStore] initialized')

        // 被动监听：外部通知需要重新加载配置
        evtbus.on("sys:usedark", (bDark) => {
            if (this.#theme === 'system') {
                setMode(bDark ? "dark" : "light");
            }
        })

        evtbus.on('cfg:setall', (cfg: AppConfig) => {
            this.applyConfig(cfg);
            log.debug('[ConfigStore] received cfg:setall')
        })
        evtbus.on('cfg:set', ({ name, value }) => {
            switch (name) {
                case 'theme':
                    this.#theme = value as AppConfig['theme'];
                    break;
                case 'lang':
                    this.#lang = value as AppConfig['lang'];
                    break;
                case 'modelEndpoint':
                    this.#modelEndpoint = value as AppConfig['model_endpoint'];
                    break;
                case 'embed_model':
                    this.#embedModel = value as AppConfig['embed_model'];
                    break;
                case 'local_model':
                    this.#localModel = value as AppConfig['local_model'];
                    break;
                case 'models':
                    this.#providers = value as AppConfig['models'];
                    break;
                case 'autoupdate':
                    this.#autoupdate = value as AppConfig['autoupdate'];
                    break;
                default:
                    log.warn(`[ConfigStore] received cfg:set but not implement:${name}`)
            }
        })
    }

    private applyConfig(config: AppConfig) {
        this.#theme = config.theme
        this.#lang = config.lang
        this.#modelEndpoint = config.model_endpoint
        this.#embedModel = config.embed_model
        this.#localModel = config.local_model
        this.#providers = config.models
        this.#autoupdate = config.autoupdate
        this.applyTheme();
    }

    // ═══════════════════════════════════════
    //  Actions — init
    // ═══════════════════════════════════════

    /** 初始化：读取全部配置项，分发到各私有字段 */
    async init(): Promise<void> {
        log.debug('[ConfigStore] init() called')
        this.#isLoading = true
        this.#error = null
        try {
            const config: AppConfig = await api().config.getAll() as unknown as AppConfig;

            this.applyConfig(config);

            log.info(
                `[ConfigStore] config loaded, theme=${config.theme}, lang=${config.lang}, ` +
                `${config.models.length} providers`,
            )
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] init() failed', err)
        } finally {
            this.#isLoading = false
        }
    }

    // ═══════════════════════════════════════
    //  Actions — 单项配置 setter
    // ═══════════════════════════════════════

    /** 设置主题 */
    async setTheme(value: AppConfig['theme']): Promise<void> {
        log.debug(`[ConfigStore] setTheme() called, value=${value}`)
        this.#savingCount++
        this.#saveError = null
        try {
            await api().config.set({
                key: 'theme',
                value
            })
            this.#theme = value
            await this.applyTheme()
            this.#lastSaved = Date.now()
            log.info(`[ConfigStore] theme set to "${value}"`)
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] setTheme() failed', err)
        } finally {
            this.#savingCount--
        }
    }

    private async applyTheme() {
        if (this.#theme === 'system') {
            const mode = (await api().config.useDark()) ? "dark" : "light";
            setMode(mode);
            return;
        }
        setMode(this.#theme);
    }

    /** 设置语言 */
    async setLang(value: string): Promise<void> {
        log.debug(`[ConfigStore] setLang() called, value=${value}`)
        this.#savingCount++
        this.#saveError = null
        try {
            await api().config.set({
                key: 'lang',
                value
            })
            this.#lang = value
            this.#lastSaved = Date.now()
            log.info(`[ConfigStore] lang set to "${value}"`)
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] setLang() failed', err)
        } finally {
            this.#savingCount--
        }
    }

    /** 设置模型下载端点 */
    async setModelEndpoint(value: string): Promise<void> {
        log.debug(`[ConfigStore] setModelEndpoint() called, value=${value}`)
        this.#savingCount++
        this.#saveError = null
        try {
            await api().config.set({
                key: 'model_endpoint',
                value
            })
            this.#modelEndpoint = value
            this.#lastSaved = Date.now()
            log.info('[ConfigStore] model_endpoint updated')
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] setModelEndpoint() failed', err)
        } finally {
            this.#savingCount--
        }
    }

    async setAll(config: Record<string, unknown>): Promise<void> {
        api().config.setAll(config);
        this.applyConfig(config as unknown as AppConfig);
    }

    /** 设置嵌入模型名称 */
    async setEmbedModel(value: string): Promise<void> {
        log.debug(`[ConfigStore] setEmbedModel() called, value=${value}`)
        this.#savingCount++
        this.#saveError = null
        try {
            await api().config.set({
                key: 'embed_model',
                value
            })
            this.#embedModel = value
            this.#lastSaved = Date.now()
            log.info(`[ConfigStore] embed_model set to "${value}"`)
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] setEmbedModel() failed', err)
        } finally {
            this.#savingCount--
        }
    }
    async setAutoupdate(value: boolean): Promise<void> {
        log.debug(`[ConfigStore] setAutoupdate() called, value=${value}`)
        this.#savingCount++
        this.#saveError = null
        try {
            await api().config.set({
                key: 'autoupdate',
                value
            })
            this.#autoupdate = value
            this.#lastSaved = Date.now()
            log.info(`[ConfigStore] setAutoupdate set to "${value}"`)
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] setAutoupdate() failed', err)
        } finally {
            this.#savingCount--
        }
    }

    /** 设置本地模型名称 */
    async setLocalModel(value: string): Promise<void> {
        log.debug(`[ConfigStore] setLocalModel() called, value=${value}`)
        this.#savingCount++
        this.#saveError = null
        try {
            await api().config.set({
                key: 'local_model',
                value
            })
            this.#localModel = value
            this.#lastSaved = Date.now()
            log.info(`[ConfigStore] local_model set to "${value}"`)
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] setLocalModel() failed', err)
        } finally {
            this.#savingCount--
        }
    }

    // ═══════════════════════════════════════
    //  Actions — Provider 管理（持久化整个 models 数组）
    // ═══════════════════════════════════════

    /** 整体替换 Provider 列表 */
    async setProviders(providers: Provider[]): Promise<void> {
        log.debug(`[ConfigStore] setProviders() called, count=${providers.length}`)
        this.#savingCount++
        this.#saveError = null
        try {
            await api().config.set({
                key: 'models',
                value: providers
            })
            this.#providers = providers
            this.#lastSaved = Date.now()
            log.info(`[ConfigStore] providers replaced, ${providers.length} total`)
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] setProviders() failed', err)
        } finally {
            this.#savingCount--
        }
    }

    /** 新增 Provider */
    async addProvider(provider: Provider): Promise<void> {
        log.debug(`[ConfigStore] addProvider() called, id=${provider.id}`)
        if (this.#providers.some((p) => p.id === provider.id)) {
            log.error(`[ConfigStore] addProvider() duplicate id="${provider.id}"`)
            this.#saveError = `Provider "${provider.id}" already exists`
            return
        }
        await this.setProviders([...this.#providers, provider])
    }

    /** 移除 Provider */
    async removeProvider(id: string): Promise<void> {
        log.debug(`[ConfigStore] removeProvider() called, id=${id}`)
        const next = this.#providers.filter((p) => p.id !== id)
        if (next.length === this.#providers.length) {
            log.debug(`[ConfigStore] removeProvider() no-op, id="${id}" not found`)
            return
        }
        await this.setProviders(next)
    }

    /** 更新 Provider（按 id 匹配替换） */
    async updateProvider(provider: Provider): Promise<void> {
        log.debug(`[ConfigStore] updateProvider() called, id=${provider.id}`)
        let found = false
        const next = this.#providers.map((p) => {
            if (p.id === provider.id) {
                found = true
                return provider
            }
            return p
        })
        if (!found) {
            log.error(`[ConfigStore] updateProvider() id="${provider.id}" not found`)
            this.#saveError = `Provider "${provider.id}" not found`
            return
        }
        await this.setProviders(next)
    }

    // ═══════════════════════════════════════
    //  纯查询（同步，无副作用）
    // ═══════════════════════════════════════

    /** 按 id 查找 Provider（返回 raw 引用，只读使用） */
    findProviderById(id: string): Provider | undefined {
        return this.#providers.find((p) => p.id === id)
    }

    /** 按 id 查找 Model（跨所有 Provider 扁平搜索） */
    findModelById(modelId: string): { provider: Provider; model: Provider['models'][number] } | undefined {
        for (const provider of this.#providers) {
            const model = provider.models.find((m) => m.id === modelId)
            if (model) return { provider, model }
        }
        return undefined
    }
}

export const configStore = new ConfigStore()