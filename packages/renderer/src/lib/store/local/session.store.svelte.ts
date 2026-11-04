// packages/renderer/src/lib/store/local/session.store.svelte.ts
import { PinyinFuseSearch } from '$lib/utils/fuse';
import { hooks } from "$lib/utils/hook";
import log from 'electron-log/renderer';
import { i18nStore } from '../i18n.svelte';
import type { ChatSession } from './chat.types';


// ── 类型定义 ──

export interface TimeGroup {
    id: string
    label: string
    sessions: ChatSession[]
}

// ── 假数据工厂（待替换为 api() 调用）──

async function fakeFetchAllSessions(): Promise<ChatSession[]> {
    // TODO: 替换为 await api().chat.listSessions()
    // 对应主进程 PrjDB.listSessions(params?)，一次性返回全部
    await new Promise((resolve) => setTimeout(resolve, 500))
    return []
}

async function fakeCreateSession(): Promise<ChatSession> {
    // TODO: 替换为 await api().chat.createSession({ title: '新对话' })
    // 对应主进程 PrjDB.createSession(input?) → id，然后用 getSession(id) 取回完整对象
    await new Promise((resolve) => setTimeout(resolve, 300))
    const now = Date.now()
    return {
        id: `session-${now}`,
        title: '新对话',
        titleManual: false,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
    }
}

async function fakeDeleteSession(_id: string): Promise<boolean> {
    // TODO: 替换为 await api().chat.deleteSession(id)
    await new Promise((resolve) => setTimeout(resolve, 300))
    return true
}

async function fakeUpdateTitle(_id: string, _title: string): Promise<boolean> {
    // TODO: 替换为 await api().chat.updateSessionTitle(id, title, true)
    await new Promise((resolve) => setTimeout(resolve, 200))
    return true
}

async function fakeClearAll(): Promise<void> {
    // TODO: 替换为 await api().chat.clearAllSessions()
    await new Promise((resolve) => setTimeout(resolve, 500))
}

// ── SessionStore 类 ──

class SessionStore {
    // ── 私有状态 ──

    // 全量会话列表，需要细粒度 mutation（标题修改、按 id 删除）→ $state
    #sessions = $state<ChatSession[]>([])
    #activeSessionId = $state<string | undefined>(undefined)
    #searchQuery = $state('')
    // 多选集合；Svelte 5 原生支持响应式 Set
    #selectedIds = $state(new Set<string>())

    // 异步状态机 - init（唯一需要完整状态机的操作）
    #isLoadingInit = $state(false)
    #errorInit = $state<string | null>(null)
    #lastUpdatedInit = $state<number | null>(null)

    // 次要操作的 loading 标记
    #isCreating = $state(false)
    #isDeleting = $state(false)
    #isUpdating = $state(false)
    #isClearing = $state(false)

    constructor() {
        log.info('[SessionStore] initialized')

        hooks.hook("project:loaded", async () => {
            //项目加载完毕，开始加载其session list.
            await this.loadAllSession();
        })
    }

    // ── 只读门面 ──
    get sessions() { return this.#sessions }
    get activeSessionId() { return this.#activeSessionId }
    get searchQuery() { return this.#searchQuery }
    get selectedIds() { return this.#selectedIds }

    get isLoadingInit() { return this.#isLoadingInit }
    get errorInit() { return this.#errorInit }
    get lastUpdatedInit() { return this.#lastUpdatedInit }
    get isCreating() { return this.#isCreating }
    get isDeleting() { return this.#isDeleting }
    get isUpdating() { return this.#isUpdating }
    get isClearing() { return this.#isClearing }

    // ── 派生状态 ──

    readonly hasSearch = $derived(this.#searchQuery.trim().length > 0)
    readonly hasMultiSelect = $derived(this.#selectedIds.size > 0)

    /**
     * Fuse 索引：只在 #sessions 变化时重建；
     * 由于 $derived 是惰性的，无搜索时 filteredSessions 不会读取它，索引不会构造。
     */
    #fuseIndex = $derived.by(() =>
        new PinyinFuseSearch(
            this.#sessions.map((s) => ({ id: s.id, text: s.title })),
        ),
    )

    /** 搜索过滤结果：无搜索词时直接返回全量；有搜索词时跑 Fuse */
    readonly filteredSessions = $derived.by((): ChatSession[] => {
        if (!this.hasSearch) return this.#sessions
        const query = this.#searchQuery.trim()
        const matchedIds = new Set(this.#fuseIndex.search(query))
        return this.#sessions.filter((s) => matchedIds.has(s.id))
    })

    /** 按时间分组：基于 filteredSessions，而非全量 */
    readonly groupedSessions = $derived.by((): TimeGroup[] => {
        const now = i18nStore.dayjs();
        const groups: TimeGroup[] = [
            { id: 'today', label: '今天', sessions: [] },
            { id: 'yesterday', label: '昨天', sessions: [] },
            { id: 'week', label: '7 天内', sessions: [] },
            { id: 'month', label: '30 天内', sessions: [] },
            { id: 'older', label: '更早', sessions: [] },
        ]

        const sorted = [...this.filteredSessions].sort(
            (a, b) =>
                (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt),
        )

        for (const session of sorted) {
            const ts = i18nStore.dayjs(session.lastMessageAt ?? session.updatedAt)
            const diffDays = now.diff(ts, 'day')

            if (diffDays === 0) groups[0].sessions.push(session)
            else if (diffDays === 1) groups[1].sessions.push(session)
            else if (diffDays <= 7) groups[2].sessions.push(session)
            else if (diffDays <= 30) groups[3].sessions.push(session)
            else groups[4].sessions.push(session)
        }

        return groups.filter((g) => g.sessions.length > 0)
    })

    // ── 主要 Action（完整状态机）──

    /** 加载全量会话；重复调用等于刷新 */
    private async loadAllSession(): Promise<void> {
        log.debug('[SessionStore] init() called')
        this.#isLoadingInit = true
        this.#errorInit = null

        try {
            const all = await fakeFetchAllSessions()
            this.#sessions = all
            this.#lastUpdatedInit = Date.now()
            log.info(`[SessionStore] init completed, loaded ${all.length} sessions`)
        } catch (err) {
            this.#errorInit = err instanceof Error ? err.message : String(err)
            log.error('[SessionStore] init() failed', err)
        } finally {
            this.#isLoadingInit = false
        }
    }

    // ── 次要 Action（简化状态机）──

    async createSession(): Promise<string | null> {
        log.debug('[SessionStore] createSession() called')
        this.#isCreating = true
        try {
            const newSession = await fakeCreateSession()
            this.#sessions = [newSession, ...this.#sessions]
            this.setActiveSession(newSession.id)
            log.info(`[SessionStore] session created, id=${newSession.id}`)
            return newSession.id
        } catch (err) {
            log.error('[SessionStore] createSession() failed', err)
            return null
        } finally {
            this.#isCreating = false
        }
    }

    async deleteSession(id: string): Promise<boolean> {
        log.debug(`[SessionStore] deleteSession() called, id=${id}`)
        this.#isDeleting = true
        try {
            const success = await fakeDeleteSession(id)
            if (!success) {
                log.error(`[SessionStore] deleteSession failed, id=${id}`)
                return false
            }

            this.#sessions = this.#sessions.filter((s) => s.id !== id)
            this.#selectedIds.delete(id)
            if (this.#activeSessionId === id) {
                this.#activeSessionId = this.#sessions[0]?.id
            }
            log.info(`[SessionStore] session deleted, id=${id}`)
            return true
        } catch (err) {
            log.error(`[SessionStore] deleteSession() failed, id=${id}`, err)
            return false
        } finally {
            this.#isDeleting = false
        }
    }

    async deleteMultiple(ids: string[]): Promise<number> {
        log.debug(`[SessionStore] deleteMultiple() called, count=${ids.length}`)
        this.#isDeleting = true
        try {
            let deleted = 0
            for (const id of ids) {
                if (await this.deleteSession(id)) deleted++
            }
            this.#selectedIds.clear()
            log.info(`[SessionStore] deleted ${deleted}/${ids.length} sessions`)
            return deleted
        } finally {
            this.#isDeleting = false
        }
    }

    async updateSessionTitle(id: string, newTitle: string): Promise<boolean> {
        log.debug(`[SessionStore] updateSessionTitle() called, id=${id}`)
        this.#isUpdating = true
        try {
            const success = await fakeUpdateTitle(id, newTitle)
            if (!success) {
                log.error(`[SessionStore] updateSessionTitle failed, id=${id}`)
                return false
            }
            const session = this.#sessions.find((s) => s.id === id)
            if (session) {
                session.title = newTitle
                session.titleManual = true
            }
            log.info(`[SessionStore] session title updated, id=${id}`)
            return true
        } catch (err) {
            log.error(`[SessionStore] updateSessionTitle() failed, id=${id}`, err)
            return false
        } finally {
            this.#isUpdating = false
        }
    }

    async clearAllSessions(): Promise<void> {
        log.debug('[SessionStore] clearAllSessions() called')
        this.#isClearing = true
        try {
            await fakeClearAll()
            this.#sessions = []
            this.#activeSessionId = undefined
            this.#selectedIds.clear()
            log.info('[SessionStore] all sessions cleared')
        } catch (err) {
            log.error('[SessionStore] clearAllSessions() failed', err)
            throw err
        } finally {
            this.#isClearing = false
        }
    }

    // ── 本地状态操作（无异步、无状态机）──

    setSearchQuery(value: string): void {
        this.#searchQuery = value
        // 搜索上下文变化时清空多选，避免选中态指向不可见项
        if (this.#selectedIds.size > 0) this.#selectedIds.clear()
    }

    clearSearch(): void {
        this.setSearchQuery('')
    }

    setActiveSession(id: string): void {
        log.debug(`[SessionStore] setActiveSession() called, id=${id}`)
        this.#activeSessionId = id
        // TODO: 持久化：await api().chat.setActiveSession(id)
    }

    toggleSelect(id: string): void {
        if (this.#selectedIds.has(id)) this.#selectedIds.delete(id)
        else this.#selectedIds.add(id)
    }

    selectAll(): void {
        // 只全选当前可见（过滤后）的会话
        for (const s of this.filteredSessions) this.#selectedIds.add(s.id)
    }

    clearSelection(): void {
        this.#selectedIds.clear()
    }
}

// ── 单例导出 ──
const KEY = Symbol.for('unigen.renderer.sessionStore')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sessionStore: SessionStore = ((globalThis as any)[KEY] ??= new SessionStore())