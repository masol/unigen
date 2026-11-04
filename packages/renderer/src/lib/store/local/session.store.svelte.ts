// packages/renderer/src/lib/store/local/session.store.svelte.ts
import { safeApi } from '$lib/utils/api';
import { PinyinFuseSearch } from '$lib/utils/fuse';
import { hooks } from "$lib/utils/hook";
import { DbKeys } from '$lib/utils/service/dbkeys';
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

async function fakeUpdateTitle(_id: string, _title: string): Promise<boolean> {
    // TODO: 替换为 await api().chat.updateSessionTitle(id, title, true)
    await new Promise((resolve) => setTimeout(resolve, 200))
    return true
}

// ── SessionStore 类 ──

class SessionStore {
    // ── 私有状态 ──

    // 全量会话列表，需要细粒度 mutation（标题修改、按 id 删除）→ $state
    #sessions = $state<ChatSession[]>([])
    #activeSessionId = $state<string | undefined>(undefined)
    #searchQuery = $state('')

    // 异步状态机 - init（唯一需要完整状态机的操作）
    #isLoadingInit = $state(false)
    #errorInit = $state<string | null>(null)
    #lastUpdatedInit = $state<number | null>(null)

    // 次要操作的 loading 标记
    #isCreating = $state(false)
    #isDeleting = $state(false)
    #isUpdating = $state(false)

    constructor() {
        log.info('[SessionStore] initialized')

        hooks.hook("project:loaded", async () => {
            //项目加载完毕，开始加载其session list.
            await this.reload();
        })
    }

    // ── 只读门面 ──
    get sessions() { return this.#sessions }
    get activeSessionId() { return this.#activeSessionId }
    get searchQuery() { return this.#searchQuery }

    get isLoadingInit() { return this.#isLoadingInit }
    get errorInit() { return this.#errorInit }
    get lastUpdatedInit() { return this.#lastUpdatedInit }
    get isCreating() { return this.#isCreating }
    get isDeleting() { return this.#isDeleting }
    get isUpdating() { return this.#isUpdating }

    // ── 派生状态 ──

    readonly hasSearch = $derived(this.#searchQuery.trim().length > 0)

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
    private async reload(): Promise<void> {
        log.debug('[SessionStore] init() called')
        this.#isLoadingInit = true
        this.#errorInit = null

        try {
            const sessInfo = await safeApi().project.listSessions();
            console.log("load all session...", sessInfo)
            this.#sessions = sessInfo.sesses;
            this.#lastUpdatedInit = Date.now()
            await this.onSessionChange(sessInfo.active);
            log.info(`[SessionStore] init completed, loaded ${sessInfo.sesses.length} sessions`)
        } catch (err) {
            this.#errorInit = err instanceof Error ? err.message : String(err)
            log.error('[SessionStore] init() failed', err)
        } finally {
            this.#isLoadingInit = false
        }
    }

    private async onSessionChange(newId: string): Promise<void> {
        this.#activeSessionId = newId;
        await hooks.callHook("session:changed");
        log.debug("session:changed hook over")
    }

    // ── 次要 Action（简化状态机）──

    async createSession(): Promise<string | null> {
        log.debug('[SessionStore] createSession() called')
        this.#isCreating = true
        try {
            const newSession = await safeApi().project.createSession();
            this.#sessions = [newSession, ...this.#sessions]
            // 已经保存为当前激活session了。
            await this.onSessionChange(newSession.id);
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
            await safeApi().project.deleteSession(id);

            this.#sessions = this.#sessions.filter((s) => s.id !== id)
            if (this.#sessions.length === 0) {
                await this.reload();
            } else if (this.#activeSessionId === id) {
                await this.onSessionChange(this.#sessions[0].id);
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

    // ── 本地状态操作（无异步、无状态机）──

    setSearchQuery(value: string): void {
        this.#searchQuery = value
    }

    clearSearch(): void {
        this.setSearchQuery('')
    }

    async setActiveSession(id: string): Promise<void> {
        log.debug(`[SessionStore] setActiveSession() called, id=${id}`)
        await safeApi().project.set({
            key: DbKeys.sessionId,
            value: id
        })
        await this.onSessionChange(id);
    }
}

// ── 单例导出 ──
const KEY = Symbol.for('unigen.renderer.sessionStore')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sessionStore: SessionStore = ((globalThis as any)[KEY] ??= new SessionStore())