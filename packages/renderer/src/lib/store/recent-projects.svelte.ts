import { api } from '$lib/utils/api'
// import evtbus from '$lib/utils/evtbus'
import type { RecentProject } from '@app/main/types'
import log from 'electron-log/renderer'

class RecentProjectsStore {
    // ── 私有状态 ──
    // 列表只做整体替换（每次 load 后重新赋值），用 raw 避免深度 Proxy 开销
    #projects = $state.raw<RecentProject[]>([])
    #isLoading = $state(false)
    #error = $state<string | null>(null)

    // ── 只读门面 ──
    get projects() { return this.#projects }
    get isLoading() { return this.#isLoading }
    get error() { return this.#error }

    // ── 派生 ──
    readonly isEmpty = $derived(this.#projects.length === 0)
    readonly count = $derived(this.#projects.length)

    constructor() {
        log.info('[RecentProjectsStore] initialized')
        // this.load()

        // 外部如有"最近项目变更"通知，被动刷新；只听不发
        // evtbus.on('recent:projects', () => {
        //     log.debug('[RecentProjectsStore] received recent-projects:changed')
        //     void this.load()
        // })
    }

    // ── Action ──
    // 系统初始时调用，后续通过事件自动同步。
    async load(): Promise<void> {
        log.debug('[RecentProjectsStore] load() called')
        this.#isLoading = true
        this.#error = null
        try {
            const result = await api().config.recents()
            this.#projects = result
            log.info(`[RecentProjectsStore] data loaded, ${result.length} items`)
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err)
            log.error('[RecentProjectsStore] load() failed', err)
        } finally {
            this.#isLoading = false
        }
    }

    async open(project: RecentProject): Promise<void> {
        log.debug(`[RecentProjectsStore] open() called, path=${project.path}`)
        try {
            // TODO: 替换为 await api().project.open(project.path)
            await new Promise((r) => setTimeout(r, 200))
            log.info(`[RecentProjectsStore] project opened, path=${project.path}`)
        } catch (err) {
            log.error('[RecentProjectsStore] open() failed', err)
        }
    }
}

export const recentProjectsStore = new RecentProjectsStore()