// packages/renderer/src/lib/store/local/session.store.svelte.ts
import { safeApi } from '$lib/utils/api';
import evtbus from '$lib/utils/evtbus';
import { PinyinFuseSearch } from '$lib/utils/fuse';
import { hooks } from "$lib/utils/hook";
import { DbKeys } from '$lib/utils/service/dbkeys';
import { default as log } from 'electron-log/renderer';
import { i18nStore } from '../i18n.svelte';
import type { ChatSession, SessionPatch } from './chat.types';


// ── 类型定义 ──

export interface TimeGroup {
    id: string
    label: string
    sessions: ChatSession[]
}

/** 会话在列表中的排序键（降序排列，新的在前） */
function sessionOrderKey(s: Pick<ChatSession, 'createdAt' | 'updatedAt'>): number {
    return s.createdAt ?? s.updatedAt ?? 0
}

// ── SessionStore 类 ──

class SessionStore {
    // ── 私有状态 ──

    // 全量会话列表，需要细粒度 mutation（标题修改、按 id 删除）→ $state
    #sessions = $state<ChatSession[]>([])
    #activeSessionId = $state<string | undefined>(undefined)
    #searchQuery = $state('')

    /**
     * 运行中会话 id 列表（瞬态，不持久化、不属于 ChatSession）。
     *
     * 为什么用「数组 + 整体替换」而不是 Set：
     * $state(new Set()) 的深层响应式在「写入发生在方法内、读取穿透到另一个方法」
     * 这种间接访问路径下不可靠——add()/delete() 后，读取方的 $derived 不会重跑，
     * 表现为「状态已变但 UI 不刷新，切换其它过滤条件后才出现」。
     * 数组整体替换引用能 100% 触发所有读取方的派生重算。
     * running 数量通常为 0~数个，includes 的 O(n) 开销可忽略。
     */
    #runningSessionIds = $state<string[]>([])
    #runningOnly = $state(false)

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
    get runningOnly() { return this.#runningOnly }

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

    /**
     * 过滤结果：搜索词（Fuse）与「只看执行中」可组合。
     * 无搜索词时不构建/读取 Fuse 索引。
     */
    readonly filteredSessions = $derived.by((): ChatSession[] => {
        let result = this.#sessions

        if (this.hasSearch) {
            const query = this.#searchQuery.trim()
            const matchedIds = new Set(this.#fuseIndex.search(query))
            result = result.filter((s) => matchedIds.has(s.id))
        }

        if (this.#runningOnly) {
            // 读取 #runningSessionIds（数组）以建立依赖，运行集合变化时本派生会重算
            const runningIds = this.#runningSessionIds
            result = result.filter((s) => runningIds.includes(s.id))
        }

        return result
    })

    /** 按时间分组：基于 filteredSessions，而非全量 */
    readonly groupedSessions = $derived.by((): TimeGroup[] => {
        const now = i18nStore.dayjs();
        const groups: TimeGroup[] = [
            { id: 'pinned', label: '置顶', sessions: [] },
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
            if (session.pinned) {
                groups[0].sessions.push(session)
                continue
            }

            const ts = i18nStore.dayjs(session.lastMessageAt ?? session.updatedAt)
            const diffDays = now.diff(ts, 'day')

            if (diffDays === 0) groups[1].sessions.push(session)
            else if (diffDays === 1) groups[2].sessions.push(session)
            else if (diffDays <= 7) groups[3].sessions.push(session)
            else if (diffDays <= 30) groups[4].sessions.push(session)
            else groups[5].sessions.push(session)
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
            this.#sessions = sessInfo.sesses;
            // 丢弃已不存在的会话的运行标记（刷新可能发生在项目切换后）
            const validIds = new Set(sessInfo.sesses.map((s) => s.id))
            this.#runningSessionIds = this.#runningSessionIds.filter((id) => validIds.has(id))
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
        await hooks.callHookParallel("session:changed");
        // log.debug("session:changed hook over")
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
            this.#runningSessionIds = this.#runningSessionIds.filter((x) => x !== id)
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

    /**
     * 增加session的message Count.不再通知主进程，而是在消息追加时自动更新。
     * @param sessId 对应的sessionId
     */
    updMessageCount(cnt = 1, sessId?: string): void {
        const sid = sessId ?? this.#activeSessionId;
        const session = this.#sessions.find((s) => s.id === sid)
        if (session) {
            session.messageCount += cnt;
        }
    }

    // 自动更新title，不调用主进程，而是采用相同算法。
    autoTitle(newTitle: string): void {
        if (!this.#activeSessionId) {
            return;
        }
        const session = this.#sessions.find((s) => s.id === this.#activeSessionId)
        // Logger.debug(newTitle, " session autoTitle session=", session)
        if (session && !session.titleManual) {
            session.title = newTitle
        }
    }

    async updateSessionTitle(id: string, newTitle: string): Promise<boolean> {
        log.debug(`[SessionStore] updateSessionTitle() called, id=${id}`)
        this.#isUpdating = true
        try {
            await safeApi().project.updateSessTitle({ id, title: newTitle })
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

    async setPinned(id: string, pinned: boolean): Promise<boolean> {
        log.debug(`[SessionStore] setPinned() called, id=${id}, pinned=${pinned}`)
        const session = this.#sessions.find((s) => s.id === id)
        if (!session) return false
        if (session.pinned === pinned) return true

        try {
            await safeApi().project.pinSession({ id, pin: pinned })
            session.pinned = pinned
            log.info(`[SessionStore] session pinned updated, id=${id}, pinned=${pinned}`)
            return true
        } catch (err) {
            log.error(`[SessionStore] setPinned() failed, id=${id}`, err)
            return false
        }
    }

    // ── 运行状态（瞬态、本地）──

    /**
     * 设置某会话的运行状态。
     * 由消息流 / 任务执行事件源调用；重复设置相同值不做任何事。
     *
     * 用数组整体替换（而非 Set.add/delete），确保写入一定触发
     * filteredSessions 与 session.item 中 isRunning 的派生重算。
     */
    setSessionRunning(id: string, running: boolean): void {
        const current = this.#runningSessionIds
        const exists = current.includes(id)
        if (exists === running) return

        this.#runningSessionIds = running
            ? [...current, id]
            : current.filter((x) => x !== id)
    }

    /** 供条目组件在 $derived 中读取；includes 遍历数组会建立依赖 */
    isRunning(id: string): boolean {
        return this.#runningSessionIds.includes(id)
    }

    setRunningOnly(value: boolean): void {
        this.#runningOnly = value
    }

    toggleRunningOnly(): void {
        this.#runningOnly = !this.#runningOnly
    }

    // ── 本地状态操作（无异步、无状态机）──

    /**
     * Upsert 一条会话：
     * - 已存在（同 id）→ 用 patch 就地合并字段（细粒度 mutation，$state 深度代理保证响应式）
     * - 不存在 → 构造一条会话，按 createdAt 降序插入到正确位置
     *
     * 纯本地操作：不发请求、不改 activeSessionId。
     * #sessions 变化后，#fuseIndex / filteredSessions / groupedSessions 会自动重算。
     */
    upsertSession(patch: SessionPatch): void {
        const idx = this.#sessions.findIndex((s) => s.id === patch.id)

        if (idx !== -1) {
            Object.assign(this.#sessions[idx], patch)
            log.debug(`[SessionStore] session merged, id=${patch.id}`)
            return
        }

        // 补全排序所需的时间戳；其余字段由调用方保证完整
        const now = Date.now()
        const incoming = {
            ...patch,
            createdAt: patch.createdAt ?? now,
            updatedAt: patch.updatedAt ?? now,
        } as ChatSession

        const incomingKey = sessionOrderKey(incoming)

        // 列表按 key 降序：插在第一个比它「旧」的元素之前
        const insertAt = this.#sessions.findIndex((s) => sessionOrderKey(s) < incomingKey)

        if (insertAt === -1) {
            this.#sessions.push(incoming)
        } else {
            this.#sessions.splice(insertAt, 0, incoming)
        }

        log.info(
            `[SessionStore] session inserted, id=${patch.id}, at=${insertAt === -1 ? 'tail' : insertAt}`,
        )
    }

    setSearchQuery(value: string): void {
        this.#searchQuery = value
    }

    clearSearch(): void {
        this.setSearchQuery('')
    }

    async setActiveSession(id: string): Promise<boolean> {
        if (id === this.#activeSessionId) return false;
        evtbus.emit("switch-session", { state: "start" });
        log.debug(`[SessionStore] setActiveSession() called, id=${id}`)
        const bOk = await safeApi().project.set({
            key: DbKeys.sessionId,
            value: id
        })
        // 发生错误，set返回undefined.
        if (!bOk) {
            evtbus.emit("switch-session", { state: "failed" });
            return false;
        }
        // 不失败时，在message reload会自行重置为false.
        await this.onSessionChange(id);
        return true;
    }
}

// ── 单例导出 ──
const KEY = Symbol.for('unigen.renderer.sessionStore')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sessionStore: SessionStore = ((globalThis as any)[KEY] ??= new SessionStore())