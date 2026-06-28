// src/lib/store/inputManager.svelte.ts
/**
 * 输入管理面板 — 跨组件响应式 Store
 * 约束：所有子组件均通过此 Store 通信，组件彼此零耦合。
 * 架构：Svelte 5 Runes 类 Store 模式（纯客户端 · 模块级单例）。
 */

import log from 'electron-log/renderer';
import type { ScriptItem, ReferenceItem } from './types';

/*
 * types.ts 参考定义（不在本文件内）：
 *
 * export type ScriptItem = {
 *     id: string;
 *     content: string;
 *     createdAt: number;
 *     updatedAt: number;
 * };
 *
 * export type ReferenceItem = {
 *     id: string;
 *     kind: 'image' | 'voice' | 'video';
 *     fileName: string;
 *     createdAt: number;
 * };
 */

// ── 三大平级区块标识 ──
type SectionKey = 'visualStyle' | 'bgm' | 'voiceover';

// ── 工具：生成稳定 ID ──
export function genId(prefix = 'id'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── 假数据工厂（待替换为 api() 调用） ──

interface InitPayload {
    scripts: ScriptItem[];
    visualStyle: ReferenceItem[];
    bgm: ReferenceItem[];
    voiceover: ReferenceItem[];
}

function fakeFetchAll(): Promise<InitPayload> {
    return new Promise((resolve) => {
        setTimeout(() => {
            const now = Date.now();
            resolve({
                scripts: [
                    { id: genId('script'), size: '第一幕：晨光初现。'.length, createdAt: now, updatedAt: now }
                ],
                visualStyle: [
                    // { id: genId('vs'), kind: 'image', fileName: 'style-cinematic.png', createdAt: now }
                ],
                bgm: [
                    { id: genId('bgm'), kind: 'voice', fileName: 'theme-piano.mp3', createdAt: now }
                ],
                voiceover: [
                    { id: genId('vo'), kind: 'voice', fileName: 'narration-01.wav', createdAt: now }
                ]
            });
        }, 500);
    });
}

function fakePersistScripts(scripts: ScriptItem[]): Promise<void> {
    void scripts;
    return new Promise((resolve) => {
        setTimeout(() => resolve(), 300);
    });
}

class InputManagerStore {
    // ── 剧本库（细粒度增删改 → $state） ──
    #scripts = $state<ScriptItem[]>([]);

    // ── 三个平级参考区块 ──
    #visualStyle = $state<ReferenceItem[]>([]); // 画面风格
    // #bgm = $state<ReferenceItem[]>([]);         // BGM
    // #voiceover = $state<ReferenceItem[]>([]);   // 画外音

    // ── 异步状态机（默认加载中 → true） ──
    #isLoading = $state(true);
    #error = $state<string | null>(null);
    #lastUpdated = $state<number | null>(null);

    // 重入保护：记录是否有进行中的 init，避免并发覆盖 loading 节奏
    #initInFlight = false;

    // ── 只读门面 ──
    get scripts() { return this.#scripts; }
    get visualStyle() { return this.#visualStyle; }
    // get bgm() { return this.#bgm; }
    // get voiceover() { return this.#voiceover; }


    get isLoading() { return this.#isLoading; }
    get error() { return this.#error; }
    get lastUpdated() { return this.#lastUpdated; }

    // ── 派生 ──
    readonly hasScripts = $derived(this.#scripts.length > 0);



    // 各区块统计（按 kind 计数）
    readonly referenceStats = $derived.by(() => {
        const count = (list: ReferenceItem[]) => {
            const stats: Record<string, number> = {};
            for (const r of list) {
                stats[r.kind] = (stats[r.kind] ?? 0) + 1;
            }
            return stats;
        };
        return {
            visualStyle: count(this.#visualStyle),
            // bgm: count(this.#bgm),
            // voiceover: count(this.#voiceover)
        };
    });

    constructor() {
    }

    // ── 初始化加载（可重入：进行中再次调用直接复用，不重置加载状态） ──
    async init(): Promise<void> {
        log.debug('[InputManagerStore] init() called');

        if (this.#initInFlight) {
            log.debug('[InputManagerStore] init() re-entered, skip (in flight)');
            return;
        }

        this.#initInFlight = true;
        this.#isLoading = true;
        this.#error = null;
        try {
            // TODO: 替换为 const payload = await api().loadInputManagerAll()
            const payload = await fakeFetchAll();
            this.#scripts = payload.scripts;
            this.#visualStyle = payload.visualStyle;
            // this.#bgm = payload.bgm;
            // this.#voiceover = payload.voiceover;
            this.#lastUpdated = Date.now();
            log.info(
                `[InputManagerStore] init loaded, scripts=${payload.scripts.length}, ` +
                `visualStyle=${payload.visualStyle.length}, bgm=${payload.bgm.length}, ` +
                `voiceover=${payload.voiceover.length}`
            );
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[InputManagerStore] init() failed', err);
        } finally {
            // init 完毕重置加载状态
            this.#isLoading = false;
            this.#initInFlight = false;
        }
    }

    // ── 剧本操作（异步） ──
    async addScript(content: string): Promise<void> {
        log.debug('[InputManagerStore] addScript() called');
        const text = typeof content === 'string' ? content : '';
        const time = Date.now();
        const item: ScriptItem = {
            id: genId('script'),
            size: text.length,
            createdAt: time,
            updatedAt: time
        };
        const next = [...this.#scripts, item];
        try {
            // TODO: 替换为 await api().createScript(item)
            await fakePersistScripts(next);
            this.#scripts = next;
            this.#lastUpdated = Date.now();
            log.info(`[InputManagerStore] script added, id=${item.id}`);
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[InputManagerStore] addScript() failed', err);
        }
    }

    async updateScript(
        id: string,
        patch: Partial<Omit<ScriptItem, 'id' | 'createdAt'>>
    ): Promise<void> {
        log.debug(`[InputManagerStore] updateScript() called, id=${id}`);
        const next = this.#scripts.map((s) =>
            s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s
        );
        try {
            // TODO: 替换为 await api().updateScript(id, patch)
            await fakePersistScripts(next);
            this.#scripts = next;
            this.#lastUpdated = Date.now();
            log.info(`[InputManagerStore] script updated, id=${id}`);
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[InputManagerStore] updateScript() failed', err);
        }
    }

    async removeScript(id: string): Promise<void> {
        log.debug(`[InputManagerStore] removeScript() called, id=${id}`);
        const next = this.#scripts.filter((s) => s.id !== id);
        try {
            // TODO: 替换为 await api().deleteScript(id)
            await fakePersistScripts(next);
            this.#scripts = next;
            this.#lastUpdated = Date.now();
            log.info(`[InputManagerStore] script removed, id=${id}`);
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[InputManagerStore] removeScript() failed', err);
        }
    }

    // ── 参考区块内部取/写工具 ──
    #getSection(section: SectionKey): ReferenceItem[] {
        switch (section) {
            case 'visualStyle': return this.#visualStyle;
            // case 'bgm': return this.#bgm;
            // case 'voiceover': return this.#voiceover;
        }
        throw new Error("Not implement")
    }

    #setSection(section: SectionKey, list: ReferenceItem[]): void {
        switch (section) {
            case 'visualStyle': this.#visualStyle = list; break;
            // case 'bgm': this.#bgm = list; break;
            // case 'voiceover': this.#voiceover = list; break;
        }
    }

    // ── 参考图操作 ──
    addReference(section: SectionKey, item: ReferenceItem): void {
        log.debug(`[InputManagerStore] addReference() called, section=${section}, id=${item.id}`);
        this.#setSection(section, [item, ...this.#getSection(section)]);
    }

    async addVisual(images: Blob[]): Promise<void> {
        console.log("add images=", images)
        void (images)
    }

    updateReference(
        section: SectionKey,
        id: string,
        patch: Partial<Omit<ReferenceItem, 'id' | 'createdAt'>>
    ): void {
        log.debug(`[InputManagerStore] updateReference() called, section=${section}, id=${id}`);
        const next = this.#getSection(section).map((r) =>
            r.id === id ? { ...r, ...patch } : r
        );
        this.#setSection(section, next);
    }

    removeReference(section: SectionKey, id: string): void {
        log.debug(`[InputManagerStore] removeReference() called, section=${section}, id=${id}`);
        this.#setSection(section, this.#getSection(section).filter((r) => r.id !== id));
    }
}

export const inputStore = new InputManagerStore();