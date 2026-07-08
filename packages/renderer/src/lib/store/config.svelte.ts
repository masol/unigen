// src/lib/store/config.svelte.ts
import { api } from '$lib/utils/api';
import { KeybindConfig } from '$lib/utils/commands/config.svelte';
import evtbus from '$lib/utils/evtbus';
import type { AppConfig, Model, Provider } from '@app/main/types';
import log from 'electron-log/renderer';
import { setMode } from "mode-watcher";
import { toast } from 'svelte-sonner';

export const DefInputToken = 256000;
export const DefOutputToken = 8192;
export const DefScore = 50;


const themeOrder: AppConfig['theme'][] = ["light", "dark", "system"];

// ── Store ──

class ConfigStore {
    // ── 私有状态：配置项 ──
    #theme = $state<AppConfig['theme']>('system') // 原始值（三选一枚举） → $state
    #lang = $state<string>('zh-CN')              // 原始值 → $state
    #projectype = $state<string>('')                   // 原始值 → $state
    #embedModel = $state<string>('')                   // 原始值 → $state
    #localModel = $state<string>('')                   // 原始值 → $state
    #providers = $state<Provider[]>([])           // 复合对象整体替换 → $state.raw
    #autoupdate = $state<boolean>(true)
    #disableHA = $state<boolean>(false)
    #silentSave = $state<boolean>(false)

    #itemsPerPage = $state(10);
    #fontSize = $state(14);
    #lineHeight = $state(22);
    #lineNumbers = $state(true);
    #rmblueprint = $state(false);

    // ── 私有状态：init 异步状态机 ──
    #isLoading = $state(false)
    #error = $state<string | null>(null)

    // ── 私有状态：save 异步状态机（并发安全计数器） ──
    #savingCount = $state(0)                               // 原始值 → $state
    #saveError = $state<string | null>(null)
    #lastSaved = $state<number | null>(null)

    public keybinding: KeybindConfig
    // ── 只读门面：配置项 ──
    get theme() { return this.#theme }
    get lang() { return this.#lang }
    get projectype() { return this.#projectype }
    get embedModel() { return this.#embedModel }
    get localModel() { return this.#localModel }
    get providers() { return this.#providers }
    get autoupdate() { return this.#autoupdate }
    get disableHA() { return this.#disableHA }
    get itemsPerPage() { return this.#itemsPerPage }
    get fontSize() { return this.#fontSize }
    get lineHeight() { return this.#lineHeight }
    get lineNumbers() { return this.#lineNumbers }
    get rmblueprint() { return this.#rmblueprint }
    get silentSave() { return this.#silentSave }

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

    /** 模型总数 */
    readonly totalModels = $derived(this.#providers.reduce((total, curr) => total + curr.models.length, 0))

    /** 所有 Provider 下 Model 总数 */
    readonly totalModelCount = $derived.by(() =>
        this.#providers.reduce((sum, p) => sum + p.models.length, 0),
    )

    /** embed_model 是否指向外部服务 */
    readonly isExternalEmbed = $derived(this.#embedModel.startsWith('external:'))

    private updStoreValue(name: string, value: unknown) {
        switch (name) {
            case 'theme':
                this.#theme = value as AppConfig['theme'];
                break;
            case 'lang':
                {
                    const nlang = value as AppConfig['lang'];
                    if (this.#lang !== nlang) {
                        evtbus.emit("lang:changed", nlang)
                    }
                }
                break;
            case 'plugin':
                this.#projectype = value as AppConfig['plugin'];
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
            case 'disableHA':
                this.#disableHA = value as AppConfig['disableHA'];
                break;
            case 'itemsPerPage':
                this.#itemsPerPage = value as AppConfig['itemsPerPage'];
                break;
            case 'fontSize':
                this.#fontSize = value as AppConfig['fontSize'];
                break;
            case 'lineHeight':
                this.#lineHeight = value as AppConfig['lineHeight'];
                break;
            case 'lineNumbers':
                this.#lineNumbers = value as AppConfig['lineNumbers'];
                break;
            case 'rmblueprint':
                this.#rmblueprint = value as AppConfig['rmblueprint'];
                break;
            case 'silentSave':
                this.#silentSave = value as AppConfig['silentSave'];
                break;
            case 'keybindings':
                this.keybinding.onKeybindingUpdate(value as AppConfig['keybindings'])
                break;
            default:
                log.warn(`[ConfigStore] received cfg:set but not implement:${name}`)
        }
    }

    constructor() {
        log.info('[ConfigStore] initialized')
        this.keybinding = new KeybindConfig();
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
            this.updStoreValue(name, value)
        })
    }

    private applyConfig(config: AppConfig) {
        this.#theme = config.theme
        if (this.#lang !== config.lang) {
            this.#lang = config.lang
            evtbus.emit("lang:changed", config.lang)
        }
        this.#projectype = config.plugin
        this.#embedModel = config.embed_model
        this.#localModel = config.local_model
        this.#providers = config.models
        this.#autoupdate = config.autoupdate
        this.#disableHA = config.disableHA
        this.#itemsPerPage = config.itemsPerPage
        this.#fontSize = config.fontSize
        this.#lineHeight = config.lineHeight
        this.#lineNumbers = config.lineNumbers
        this.#rmblueprint = config.rmblueprint
        this.#silentSave = config.silentSave

        this.applyTheme();
        this.keybinding.onKeybindingUpdate(config.keybindings);
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
    async cycleTheme(): Promise<void> {
        const idx = themeOrder.indexOf(this.#theme);
        this.setTheme(themeOrder[(idx + 1) % themeOrder.length]);
    }

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
            toast.error(this.#saveError);
        } finally {
            this.#savingCount--
        }
    }

    async setDisableHA(value: AppConfig['disableHA']): Promise<void> {
        log.debug(`[ConfigStore] setTheme() called, value=${value}`)
        this.#savingCount++
        this.#saveError = null
        try {
            await api().config.set({
                key: 'disableHA',
                value
            })
            this.#disableHA = value
            this.#lastSaved = Date.now()
            log.info(`[ConfigStore] theme set to "${value}"`)
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] setDisableHA() failed', err)
            toast.error(this.#saveError);
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
            if (this.#lang !== value) {
                this.#lang = value
                evtbus.emit("lang:changed", value)
            }
            this.#lastSaved = Date.now()
            log.info(`[ConfigStore] lang set to "${value}"`)
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] setLang() failed', err)
            toast.error(this.#saveError);
        } finally {
            this.#savingCount--
        }
    }


    async setConfig(key: string, value: unknown): Promise<void> {
        log.debug(`[ConfigStore] setConfig() called,key=${key} value=${value}`)
        this.#savingCount++
        this.#saveError = null
        try {
            await api().config.set({
                key,
                value
            })
            this.updStoreValue(key, value)
            this.#lastSaved = Date.now()
            log.info(`[ConfigStore] ${key} set to "${value}"`)
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] set ${key} failed', err)
            toast.error(this.#saveError);
        } finally {
            this.#savingCount--
        }
    }

    /** 设置模型下载端点 */
    async setProjectype(value: string): Promise<void> {
        log.debug(`[ConfigStore] setModelEndpoint() called, value=${value}`)
        this.#savingCount++
        this.#saveError = null
        try {
            await api().config.set({
                key: 'plugin',
                value
            })
            this.#projectype = value
            this.#lastSaved = Date.now()
            log.info('[ConfigStore] model_endpoint updated')
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] setModelEndpoint() failed', err)
            toast.error(this.#saveError);
        } finally {
            this.#savingCount--
        }
    }

    async setAll(config: Record<string, unknown>): Promise<void> {
        await api().config.setAll(config);
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
            toast.error(this.#saveError);
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
            toast.error(this.#saveError);
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
            toast.error(this.#saveError);
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
            toast.error(this.#saveError);
        } finally {
            this.#savingCount--
        }
    }

    async upsertProvider(provider: Provider): Promise<void> {
        if (this.#providers.find(p => p.id === provider.id)) {
            return await this.updateProvider(provider);
        }
        return await this.addProvider(provider);
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
                provider.models = p.models;
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


    /** 整体替换 models 列表 */
    private async setModels(pid: string, models: Model[]): Promise<void> {
        this.#savingCount++
        this.#saveError = null
        try {
            const provider = this.#providers.find((p) => p.id === pid)
            if (provider) {
                provider.models = models;
            }
            await api().config.set({
                key: 'models',
                value: this.#providers
            })
            this.#lastSaved = Date.now()
            log.info(`[ConfigStore] models replaced for ${pid}, ${models.length} total`)
        } catch (err) {
            this.#saveError = err instanceof Error ? err.message : String(err)
            log.error('[ConfigStore] setModels() failed', err)
            toast.error(this.#saveError);
        } finally {
            this.#savingCount--
        }
    }

    /** 移除 Provider */
    async removeModel(pid: string, mid: string): Promise<void> {
        log.debug(`[ConfigStore] removeModel() called, pid=${pid},mid=${mid}`)
        const provider = this.#providers.find((p) => p.id === pid)
        if (provider) {
            const next = provider.models.filter((m) => m.id !== mid);
            if (next.length === provider.models.length) {
                log.debug(`[ConfigStore] removeModel() no-op, mid="${mid}" not found`)
                return
            }
            await this.setModels(provider.id, next)
        }
    }

    /** 新增 model */
    private async addModel(provider: Provider, model: Model): Promise<void> {
        if (provider.models.some((m) => m.id === model.id)) {
            log.error(`[ConfigStore] addModel() duplicate id="${model.id}"`)
            this.#saveError = `Model id ${model.id} in Provider "${provider.id}" already exists`
            return
        }
        await this.setModels(provider.id, [...provider.models, model])
    }

    /** 更新 model（按 id 匹配替换） */
    async upsertModel(pid: string, model: Model): Promise<void> {
        log.debug(`[ConfigStore] updateModel() called, pid=${pid},mid=${model.id}`)
        const provider = this.#providers.find((p) => p.id === pid)
        if (provider) {
            let found = false

            const next = provider.models.map((m) => {
                if (m.id === model.id) {
                    found = true
                    return model
                }
                return m
            })
            if (!found) {
                //新建模型。
                await this.addModel(provider, model);
                // log.error(`[ConfigStore] updateModel() id="${model.id}" in ${pid} not found`)
                // this.#saveError = `id="${model.id}" in Provider "${pid}" not found`
                return
            }
            await this.setModels(pid, next)
        }
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

    monacoDark = {
        "colors": {
            "activityBar.activeBorder": "#f78166",
            "activityBar.background": "#0d1117",
            "activityBar.border": "#30363d",
            "activityBar.foreground": "#e6edf3",
            "activityBar.inactiveForeground": "#7d8590",
            "activityBarBadge.background": "#1f6feb",
            "activityBarBadge.foreground": "#ffffff",
            "badge.background": "#1f6feb",
            "badge.foreground": "#ffffff",
            "breadcrumb.activeSelectionForeground": "#7d8590",
            "breadcrumb.focusForeground": "#e6edf3",
            "breadcrumb.foreground": "#7d8590",
            "breadcrumbPicker.background": "#161b22",
            "button.background": "#238636",
            "button.foreground": "#ffffff",
            "button.hoverBackground": "#2ea043",
            "button.secondaryBackground": "#282e33",
            "button.secondaryForeground": "#c9d1d9",
            "button.secondaryHoverBackground": "#30363d",
            "checkbox.background": "#161b22",
            "checkbox.border": "#30363d",
            "debugConsole.errorForeground": "#ffa198",
            "debugConsole.infoForeground": "#8b949e",
            "debugConsole.sourceForeground": "#e3b341",
            "debugConsole.warningForeground": "#d29922",
            "debugConsoleInputIcon.foreground": "#bc8cff",
            "debugIcon.breakpointForeground": "#f85149",
            "debugTokenExpression.boolean": "#56d364",
            "debugTokenExpression.error": "#ffa198",
            "debugTokenExpression.name": "#79c0ff",
            "debugTokenExpression.number": "#56d364",
            "debugTokenExpression.string": "#a5d6ff",
            "debugTokenExpression.value": "#a5d6ff",
            "debugToolBar.background": "#161b22",
            "descriptionForeground": "#7d8590",
            "diffEditor.insertedLineBackground": "#23863626",
            "diffEditor.insertedTextBackground": "#3fb9504d",
            "diffEditor.removedLineBackground": "#da363326",
            "diffEditor.removedTextBackground": "#ff7b724d",
            "dropdown.background": "#161b22",
            "dropdown.border": "#30363d",
            "dropdown.foreground": "#e6edf3",
            "dropdown.listBackground": "#161b22",
            "editor.background": "#0d1117",
            "editor.findMatchBackground": "#9e6a03",
            "editor.findMatchHighlightBackground": "#f2cc6080",
            "editor.focusedStackFrameHighlightBackground": "#2ea04366",
            "editor.foldBackground": "#6e76811a",
            "editor.foreground": "#e6edf3",
            "editor.lineHighlightBackground": "#6e76811a",
            "editor.linkedEditingBackground": "#2f81f712",
            "editor.selectionHighlightBackground": "#3fb95040",
            "editor.stackFrameHighlightBackground": "#bb800966",
            "editor.wordHighlightBackground": "#6e768180",
            "editor.wordHighlightBorder": "#6e768199",
            "editor.wordHighlightStrongBackground": "#6e76814d",
            "editor.wordHighlightStrongBorder": "#6e768199",
            "editorBracketHighlight.foreground1": "#79c0ff",
            "editorBracketHighlight.foreground2": "#56d364",
            "editorBracketHighlight.foreground3": "#e3b341",
            "editorBracketHighlight.foreground4": "#ffa198",
            "editorBracketHighlight.foreground5": "#ff9bce",
            "editorBracketHighlight.foreground6": "#d2a8ff",
            "editorBracketHighlight.unexpectedBracket.foreground": "#7d8590",
            "editorBracketMatch.background": "#3fb95040",
            "editorBracketMatch.border": "#3fb95099",
            "editorCursor.foreground": "#2f81f7",
            "editorGroup.border": "#30363d",
            "editorGroupHeader.tabsBackground": "#010409",
            "editorGroupHeader.tabsBorder": "#30363d",
            "editorGutter.addedBackground": "#2ea04366",
            "editorGutter.deletedBackground": "#f8514966",
            "editorGutter.modifiedBackground": "#bb800966",
            "editorIndentGuide.activeBackground": "#e6edf33d",
            "editorIndentGuide.background": "#e6edf31f",
            "editorInlayHint.background": "#8b949e33",
            "editorInlayHint.foreground": "#7d8590",
            "editorInlayHint.paramBackground": "#8b949e33",
            "editorInlayHint.paramForeground": "#7d8590",
            "editorInlayHint.typeBackground": "#8b949e33",
            "editorInlayHint.typeForeground": "#7d8590",
            "editorLineNumber.activeForeground": "#e6edf3",
            "editorLineNumber.foreground": "#6e7681",
            "editorOverviewRuler.border": "#010409",
            "editorWhitespace.foreground": "#484f58",
            "editorWidget.background": "#161b22",
            "errorForeground": "#f85149",
            "focusBorder": "#1f6feb",
            "foreground": "#e6edf3",
            "gitDecoration.addedResourceForeground": "#3fb950",
            "gitDecoration.conflictingResourceForeground": "#db6d28",
            "gitDecoration.deletedResourceForeground": "#f85149",
            "gitDecoration.ignoredResourceForeground": "#6e7681",
            "gitDecoration.modifiedResourceForeground": "#d29922",
            "gitDecoration.submoduleResourceForeground": "#7d8590",
            "gitDecoration.untrackedResourceForeground": "#3fb950",
            "icon.foreground": "#7d8590",
            "input.background": "#0d1117",
            "input.border": "#30363d",
            "input.foreground": "#e6edf3",
            "input.placeholderForeground": "#6e7681",
            "keybindingLabel.foreground": "#e6edf3",
            "list.activeSelectionBackground": "#6e768166",
            "list.activeSelectionForeground": "#e6edf3",
            "list.focusBackground": "#388bfd26",
            "list.focusForeground": "#e6edf3",
            "list.highlightForeground": "#2f81f7",
            "list.hoverBackground": "#6e76811a",
            "list.hoverForeground": "#e6edf3",
            "list.inactiveFocusBackground": "#388bfd26",
            "list.inactiveSelectionBackground": "#6e768166",
            "list.inactiveSelectionForeground": "#e6edf3",
            "minimapSlider.activeBackground": "#8b949e47",
            "minimapSlider.background": "#8b949e33",
            "minimapSlider.hoverBackground": "#8b949e3d",
            "notificationCenterHeader.background": "#161b22",
            "notificationCenterHeader.foreground": "#7d8590",
            "notifications.background": "#161b22",
            "notifications.border": "#30363d",
            "notifications.foreground": "#e6edf3",
            "notificationsErrorIcon.foreground": "#f85149",
            "notificationsInfoIcon.foreground": "#2f81f7",
            "notificationsWarningIcon.foreground": "#d29922",
            "panel.background": "#010409",
            "panel.border": "#30363d",
            "panelInput.border": "#30363d",
            "panelTitle.activeBorder": "#f78166",
            "panelTitle.activeForeground": "#e6edf3",
            "panelTitle.inactiveForeground": "#7d8590",
            "peekViewEditor.background": "#6e76811a",
            "peekViewEditor.matchHighlightBackground": "#bb800966",
            "peekViewResult.background": "#0d1117",
            "peekViewResult.matchHighlightBackground": "#bb800966",
            "pickerGroup.border": "#30363d",
            "pickerGroup.foreground": "#7d8590",
            "progressBar.background": "#1f6feb",
            "quickInput.background": "#161b22",
            "quickInput.foreground": "#e6edf3",
            "scrollbar.shadow": "#484f5833",
            "scrollbarSlider.activeBackground": "#8b949e47",
            "scrollbarSlider.background": "#8b949e33",
            "scrollbarSlider.hoverBackground": "#8b949e3d",
            "settings.headerForeground": "#e6edf3",
            "settings.modifiedItemIndicator": "#bb800966",
            "sideBar.background": "#010409",
            "sideBar.border": "#30363d",
            "sideBar.foreground": "#e6edf3",
            "sideBarSectionHeader.background": "#010409",
            "sideBarSectionHeader.border": "#30363d",
            "sideBarSectionHeader.foreground": "#e6edf3",
            "sideBarTitle.foreground": "#e6edf3",
            "statusBar.background": "#0d1117",
            "statusBar.border": "#30363d",
            "statusBar.debuggingBackground": "#da3633",
            "statusBar.debuggingForeground": "#ffffff",
            "statusBar.focusBorder": "#1f6feb80",
            "statusBar.foreground": "#7d8590",
            "statusBar.noFolderBackground": "#0d1117",
            "statusBarItem.activeBackground": "#e6edf31f",
            "statusBarItem.focusBorder": "#1f6feb",
            "statusBarItem.hoverBackground": "#e6edf314",
            "statusBarItem.prominentBackground": "#6e768166",
            "statusBarItem.remoteBackground": "#30363d",
            "statusBarItem.remoteForeground": "#e6edf3",
            "symbolIcon.arrayForeground": "#f0883e",
            "symbolIcon.booleanForeground": "#58a6ff",
            "symbolIcon.classForeground": "#f0883e",
            "symbolIcon.colorForeground": "#79c0ff",
            "symbolIcon.constantForeground": [
                "#aff5b4",
                "#7ee787",
                "#56d364",
                "#3fb950",
                "#2ea043",
                "#238636",
                "#196c2e",
                "#0f5323",
                "#033a16",
                "#04260f"
            ],
            "symbolIcon.constructorForeground": "#d2a8ff",
            "symbolIcon.enumeratorForeground": "#f0883e",
            "symbolIcon.enumeratorMemberForeground": "#58a6ff",
            "symbolIcon.eventForeground": "#6e7681",
            "symbolIcon.fieldForeground": "#f0883e",
            "symbolIcon.fileForeground": "#d29922",
            "symbolIcon.folderForeground": "#d29922",
            "symbolIcon.functionForeground": "#bc8cff",
            "symbolIcon.interfaceForeground": "#f0883e",
            "symbolIcon.keyForeground": "#58a6ff",
            "symbolIcon.keywordForeground": "#ff7b72",
            "symbolIcon.methodForeground": "#bc8cff",
            "symbolIcon.moduleForeground": "#ff7b72",
            "symbolIcon.namespaceForeground": "#ff7b72",
            "symbolIcon.nullForeground": "#58a6ff",
            "symbolIcon.numberForeground": "#3fb950",
            "symbolIcon.objectForeground": "#f0883e",
            "symbolIcon.operatorForeground": "#79c0ff",
            "symbolIcon.packageForeground": "#f0883e",
            "symbolIcon.propertyForeground": "#f0883e",
            "symbolIcon.referenceForeground": "#58a6ff",
            "symbolIcon.snippetForeground": "#58a6ff",
            "symbolIcon.stringForeground": "#79c0ff",
            "symbolIcon.structForeground": "#f0883e",
            "symbolIcon.textForeground": "#79c0ff",
            "symbolIcon.typeParameterForeground": "#79c0ff",
            "symbolIcon.unitForeground": "#58a6ff",
            "symbolIcon.variableForeground": "#f0883e",
            "tab.activeBackground": "#0d1117",
            "tab.activeBorder": "#0d1117",
            "tab.activeBorderTop": "#f78166",
            "tab.activeForeground": "#e6edf3",
            "tab.border": "#30363d",
            "tab.hoverBackground": "#0d1117",
            "tab.inactiveBackground": "#010409",
            "tab.inactiveForeground": "#7d8590",
            "tab.unfocusedActiveBorder": "#0d1117",
            "tab.unfocusedActiveBorderTop": "#30363d",
            "tab.unfocusedHoverBackground": "#6e76811a",
            "terminal.ansiBlack": "#484f58",
            "terminal.ansiBlue": "#58a6ff",
            "terminal.ansiBrightBlack": "#6e7681",
            "terminal.ansiBrightBlue": "#79c0ff",
            "terminal.ansiBrightCyan": "#56d4dd",
            "terminal.ansiBrightGreen": "#56d364",
            "terminal.ansiBrightMagenta": "#d2a8ff",
            "terminal.ansiBrightRed": "#ffa198",
            "terminal.ansiBrightWhite": "#ffffff",
            "terminal.ansiBrightYellow": "#e3b341",
            "terminal.ansiCyan": "#39c5cf",
            "terminal.ansiGreen": "#3fb950",
            "terminal.ansiMagenta": "#bc8cff",
            "terminal.ansiRed": "#ff7b72",
            "terminal.ansiWhite": "#b1bac4",
            "terminal.ansiYellow": "#d29922",
            "terminal.foreground": "#e6edf3",
            "textBlockQuote.background": "#010409",
            "textBlockQuote.border": "#30363d",
            "textCodeBlock.background": "#6e768166",
            "textLink.activeForeground": "#2f81f7",
            "textLink.foreground": "#2f81f7",
            "textPreformat.background": "#6e768166",
            "textPreformat.foreground": "#7d8590",
            "textSeparator.foreground": "#21262d",
            "titleBar.activeBackground": "#0d1117",
            "titleBar.activeForeground": "#7d8590",
            "titleBar.border": "#30363d",
            "titleBar.inactiveBackground": "#010409",
            "titleBar.inactiveForeground": "#7d8590",
            "tree.indentGuidesStroke": "#21262d",
            "welcomePage.buttonBackground": "#21262d",
            "welcomePage.buttonHoverBackground": "#30363d"
        },
        "displayName": "GitHub Dark Default",
        "name": "github-dark-default",
        "semanticHighlighting": true,
        "tokenColors": [
            {
                "scope": [
                    "comment",
                    "punctuation.definition.comment",
                    "string.comment"
                ],
                "settings": {
                    "foreground": "#8b949e"
                }
            },
            {
                "scope": [
                    "constant.other.placeholder",
                    "constant.character"
                ],
                "settings": {
                    "foreground": "#ff7b72"
                }
            },
            {
                "scope": [
                    "constant",
                    "entity.name.constant",
                    "variable.other.constant",
                    "variable.other.enummember",
                    "variable.language",
                    "entity"
                ],
                "settings": {
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": [
                    "entity.name",
                    "meta.export.default",
                    "meta.definition.variable"
                ],
                "settings": {
                    "foreground": "#ffa657"
                }
            },
            {
                "scope": [
                    "variable.parameter.function",
                    "meta.jsx.children",
                    "meta.block",
                    "meta.tag.attributes",
                    "entity.name.constant",
                    "meta.object.member",
                    "meta.embedded.expression"
                ],
                "settings": {
                    "foreground": "#e6edf3"
                }
            },
            {
                "scope": "entity.name.function",
                "settings": {
                    "foreground": "#d2a8ff"
                }
            },
            {
                "scope": [
                    "entity.name.tag",
                    "support.class.component"
                ],
                "settings": {
                    "foreground": "#7ee787"
                }
            },
            {
                "scope": "keyword",
                "settings": {
                    "foreground": "#ff7b72"
                }
            },
            {
                "scope": [
                    "storage",
                    "storage.type"
                ],
                "settings": {
                    "foreground": "#ff7b72"
                }
            },
            {
                "scope": [
                    "storage.modifier.package",
                    "storage.modifier.import",
                    "storage.type.java"
                ],
                "settings": {
                    "foreground": "#e6edf3"
                }
            },
            {
                "scope": [
                    "string",
                    "string punctuation.section.embedded source"
                ],
                "settings": {
                    "foreground": "#a5d6ff"
                }
            },
            {
                "scope": "support",
                "settings": {
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": "meta.property-name",
                "settings": {
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": "variable",
                "settings": {
                    "foreground": "#ffa657"
                }
            },
            {
                "scope": "variable.other",
                "settings": {
                    "foreground": "#e6edf3"
                }
            },
            {
                "scope": "invalid.broken",
                "settings": {
                    "fontStyle": "italic",
                    "foreground": "#ffa198"
                }
            },
            {
                "scope": "invalid.deprecated",
                "settings": {
                    "fontStyle": "italic",
                    "foreground": "#ffa198"
                }
            },
            {
                "scope": "invalid.illegal",
                "settings": {
                    "fontStyle": "italic",
                    "foreground": "#ffa198"
                }
            },
            {
                "scope": "invalid.unimplemented",
                "settings": {
                    "fontStyle": "italic",
                    "foreground": "#ffa198"
                }
            },
            {
                "scope": "carriage-return",
                "settings": {
                    "background": "#ff7b72",
                    "content": "^M",
                    "fontStyle": "italic underline",
                    "foreground": "#f0f6fc"
                }
            },
            {
                "scope": "message.error",
                "settings": {
                    "foreground": "#ffa198"
                }
            },
            {
                "scope": "string variable",
                "settings": {
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": [
                    "source.regexp",
                    "string.regexp"
                ],
                "settings": {
                    "foreground": "#a5d6ff"
                }
            },
            {
                "scope": [
                    "string.regexp.character-class",
                    "string.regexp constant.character.escape",
                    "string.regexp source.ruby.embedded",
                    "string.regexp string.regexp.arbitrary-repitition"
                ],
                "settings": {
                    "foreground": "#a5d6ff"
                }
            },
            {
                "scope": "string.regexp constant.character.escape",
                "settings": {
                    "fontStyle": "bold",
                    "foreground": "#7ee787"
                }
            },
            {
                "scope": "support.constant",
                "settings": {
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": "support.variable",
                "settings": {
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": "support.type.property-name.json",
                "settings": {
                    "foreground": "#7ee787"
                }
            },
            {
                "scope": "meta.module-reference",
                "settings": {
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": "punctuation.definition.list.begin.markdown",
                "settings": {
                    "foreground": "#ffa657"
                }
            },
            {
                "scope": [
                    "markup.heading",
                    "markup.heading entity.name"
                ],
                "settings": {
                    "fontStyle": "bold",
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": "markup.quote",
                "settings": {
                    "foreground": "#7ee787"
                }
            },
            {
                "scope": "markup.italic",
                "settings": {
                    "fontStyle": "italic",
                    "foreground": "#e6edf3"
                }
            },
            {
                "scope": "markup.bold",
                "settings": {
                    "fontStyle": "bold",
                    "foreground": "#e6edf3"
                }
            },
            {
                "scope": [
                    "markup.underline"
                ],
                "settings": {
                    "fontStyle": "underline"
                }
            },
            {
                "scope": [
                    "markup.strikethrough"
                ],
                "settings": {
                    "fontStyle": "strikethrough"
                }
            },
            {
                "scope": "markup.inline.raw",
                "settings": {
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": [
                    "markup.deleted",
                    "meta.diff.header.from-file",
                    "punctuation.definition.deleted"
                ],
                "settings": {
                    "background": "#490202",
                    "foreground": "#ffa198"
                }
            },
            {
                "scope": [
                    "punctuation.section.embedded"
                ],
                "settings": {
                    "foreground": "#ff7b72"
                }
            },
            {
                "scope": [
                    "markup.inserted",
                    "meta.diff.header.to-file",
                    "punctuation.definition.inserted"
                ],
                "settings": {
                    "background": "#04260f",
                    "foreground": "#7ee787"
                }
            },
            {
                "scope": [
                    "markup.changed",
                    "punctuation.definition.changed"
                ],
                "settings": {
                    "background": "#5a1e02",
                    "foreground": "#ffa657"
                }
            },
            {
                "scope": [
                    "markup.ignored",
                    "markup.untracked"
                ],
                "settings": {
                    "background": "#79c0ff",
                    "foreground": "#161b22"
                }
            },
            {
                "scope": "meta.diff.range",
                "settings": {
                    "fontStyle": "bold",
                    "foreground": "#d2a8ff"
                }
            },
            {
                "scope": "meta.diff.header",
                "settings": {
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": "meta.separator",
                "settings": {
                    "fontStyle": "bold",
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": "meta.output",
                "settings": {
                    "foreground": "#79c0ff"
                }
            },
            {
                "scope": [
                    "brackethighlighter.tag",
                    "brackethighlighter.curly",
                    "brackethighlighter.round",
                    "brackethighlighter.square",
                    "brackethighlighter.angle",
                    "brackethighlighter.quote"
                ],
                "settings": {
                    "foreground": "#8b949e"
                }
            },
            {
                "scope": "brackethighlighter.unmatched",
                "settings": {
                    "foreground": "#ffa198"
                }
            },
            {
                "scope": [
                    "constant.other.reference.link",
                    "string.other.link"
                ],
                "settings": {
                    "foreground": "#a5d6ff"
                }
            }
        ],
        "type": "dark"
    }

    monacoLight = null;
}

export const configStore = new ConfigStore()