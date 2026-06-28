// src/lib/store/spec.svelte.ts
/**
 * 规格设置 Store — 视频输出规格的跨组件响应式状态
 * 约束：所有组件通过此 Store 读写规格，组件彼此零耦合。
 * 架构：Svelte 5 Runes 类 Store 模式（纯客户端 · 模块级单例）。
 */

import log from 'electron-log/renderer';
import { api } from '$lib/utils/api';
import { DbKeys } from '../../../dbkeys';

class SpecStore {
    // ── 私有状态（细粒度修改 → $state） ──
    #aspectRatio = $state<string>('9:16');
    #resolution = $state<string>('480p');
    #frameRate = $state<string>('24');
    #duration = $state<string>('3min');
    #pace = $state<string>('normal');
    #language = $state<string>('zh');
    #audience = $state<string>('pg');
    #style = $state<string>('cinematic');

    // ── 异步状态机 ──
    #isLoading = $state(true);
    #error = $state<string | null>(null);
    #lastUpdated = $state<number | null>(null);

    // 重入保护
    #initInFlight = false;

    // ── 只读门面 ──
    get aspectRatio() { return this.#aspectRatio; }
    get resolution() { return this.#resolution; }
    get frameRate() { return this.#frameRate; }
    get duration() { return this.#duration; }
    get pace() { return this.#pace; }
    get language() { return this.#language; }
    get audience() { return this.#audience; }
    get style() { return this.#style; }

    get isLoading() { return this.#isLoading; }
    get error() { return this.#error; }
    get lastUpdated() { return this.#lastUpdated; }

    // ── 派生 ──
    readonly isDefaultSpec = $derived(
        this.#aspectRatio === '9:16' &&
        this.#resolution === '480p' &&
        this.#frameRate === '24' &&
        this.#duration === '3min' &&
        this.#pace === 'normal' &&
        this.#language === 'zh' &&
        this.#audience === 'pg' &&
        this.#style === 'cinematic'
    );

    constructor() {
        log.info('[SpecStore] initialized');
    }

    // ── 初始化加载（可重入保护） ──
    async init(): Promise<void> {
        log.debug('[SpecStore] init() called');

        if (this.#initInFlight) {
            log.debug('[SpecStore] init() re-entered, skip (in flight)');
            return;
        }

        this.#initInFlight = true;
        this.#isLoading = true;
        this.#error = null;

        try {
            const projectApi = api().project;

            const [
                aspectRatioRes,
                resolutionRes,
                frameRateRes,
                durationRes,
                paceRes,
                languageRes,
                audienceRes,
                styleRes
            ] = await Promise.all([
                projectApi.get(DbKeys.aspectRatio),
                projectApi.get(DbKeys.resolution),
                projectApi.get(DbKeys.frameRate),
                projectApi.get(DbKeys.duration),
                projectApi.get(DbKeys.pace),
                projectApi.get(DbKeys.language),
                projectApi.get(DbKeys.audience),
                projectApi.get(DbKeys.style)
            ]);

            // 赋值并提供默认值
            this.#aspectRatio = (aspectRatioRes ?? '9:16') as string;
            this.#resolution = (resolutionRes ?? '480p') as string;
            this.#frameRate = (frameRateRes ?? '24') as string;
            this.#duration = (durationRes ?? '3min') as string;
            this.#pace = (paceRes ?? 'normal') as string;
            this.#language = (languageRes ?? 'zh') as string;
            this.#audience = (audienceRes ?? 'pg') as string;
            this.#style = (styleRes ?? 'cinematic') as string;

            this.#lastUpdated = Date.now();
            log.info('[SpecStore] spec data loaded');
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[SpecStore] init() failed', err);
        } finally {
            this.#isLoading = false;
            this.#initInFlight = false;
        }
    }

    // ── 更新单个规格字段 ──
    async setAspectRatio(value: string): Promise<void> {
        log.debug(`[SpecStore] setAspectRatio() called, value=${value}`);
        try {
            await api().project.set({
                key: DbKeys.aspectRatio,
                value
            });
            this.#aspectRatio = value;
            this.#lastUpdated = Date.now();
            log.info(`[SpecStore] aspectRatio updated: ${value}`);
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[SpecStore] setAspectRatio() failed', err);
        }
    }

    async setResolution(value: string): Promise<void> {
        log.debug(`[SpecStore] setResolution() called, value=${value}`);
        try {
            await api().project.set({
                key: DbKeys.resolution,
                value
            });
            this.#resolution = value;
            this.#lastUpdated = Date.now();
            log.info(`[SpecStore] resolution updated: ${value}`);
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[SpecStore] setResolution() failed', err);
        }
    }

    async setFrameRate(value: string): Promise<void> {
        log.debug(`[SpecStore] setFrameRate() called, value=${value}`);
        try {
            await api().project.set({
                key: DbKeys.frameRate,
                value
            });
            this.#frameRate = value;
            this.#lastUpdated = Date.now();
            log.info(`[SpecStore] frameRate updated: ${value}`);
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[SpecStore] setFrameRate() failed', err);
        }
    }

    async setDuration(value: string): Promise<void> {
        log.debug(`[SpecStore] setDuration() called, value=${value}`);
        try {
            await api().project.set({
                key: DbKeys.duration,
                value
            });
            this.#duration = value;
            this.#lastUpdated = Date.now();
            log.info(`[SpecStore] duration updated: ${value}`);
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[SpecStore] setDuration() failed', err);
        }
    }

    async setPace(value: string): Promise<void> {
        log.debug(`[SpecStore] setPace() called, value=${value}`);
        try {
            await api().project.set({
                key: DbKeys.pace,
                value
            });
            this.#pace = value;
            this.#lastUpdated = Date.now();
            log.info(`[SpecStore] pace updated: ${value}`);
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[SpecStore] setPace() failed', err);
        }
    }

    async setLanguage(value: string): Promise<void> {
        log.debug(`[SpecStore] setLanguage() called, value=${value}`);
        try {
            await api().project.set({
                key: DbKeys.language,
                value
            });
            this.#language = value;
            this.#lastUpdated = Date.now();
            log.info(`[SpecStore] language updated: ${value}`);
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[SpecStore] setLanguage() failed', err);
        }
    }

    async setAudience(value: string): Promise<void> {
        log.debug(`[SpecStore] setAudience() called, value=${value}`);
        try {
            await api().project.set({
                key: DbKeys.audience,
                value
            });
            this.#audience = value;
            this.#lastUpdated = Date.now();
            log.info(`[SpecStore] audience updated: ${value}`);
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[SpecStore] setAudience() failed', err);
        }
    }

    async setStyle(value: string): Promise<void> {
        log.debug(`[SpecStore] setStyle() called, value=${value}`);
        try {
            await api().project.set({
                key: DbKeys.style,
                value
            });
            this.#style = value;
            this.#lastUpdated = Date.now();
            log.info(`[SpecStore] style updated: ${value}`);
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[SpecStore] setStyle() failed', err);
        }
    }

    // ── 批量更新（可选，适用于表单一次性提交） ──
    async updateAll(spec: {
        aspectRatio?: string;
        resolution?: string;
        frameRate?: string;
        duration?: string;
        pace?: string;
        language?: string;
        audience?: string;
        style?: string;
    }): Promise<void> {
        log.debug('[SpecStore] updateAll() called');
        try {
            const updates: Array<Promise<void>> = [];

            if (spec.aspectRatio !== undefined) {
                updates.push(
                    api().project.set({ key: DbKeys.aspectRatio, value: spec.aspectRatio })
                        .then(() => { this.#aspectRatio = spec.aspectRatio!; })
                );
            }
            if (spec.resolution !== undefined) {
                updates.push(
                    api().project.set({ key: DbKeys.resolution, value: spec.resolution })
                        .then(() => { this.#resolution = spec.resolution!; })
                );
            }
            if (spec.frameRate !== undefined) {
                updates.push(
                    api().project.set({ key: DbKeys.frameRate, value: spec.frameRate })
                        .then(() => { this.#frameRate = spec.frameRate!; })
                );
            }
            if (spec.duration !== undefined) {
                updates.push(
                    api().project.set({ key: DbKeys.duration, value: spec.duration })
                        .then(() => { this.#duration = spec.duration!; })
                );
            }
            if (spec.pace !== undefined) {
                updates.push(
                    api().project.set({ key: DbKeys.pace, value: spec.pace })
                        .then(() => { this.#pace = spec.pace!; })
                );
            }
            if (spec.language !== undefined) {
                updates.push(
                    api().project.set({ key: DbKeys.language, value: spec.language })
                        .then(() => { this.#language = spec.language!; })
                );
            }
            if (spec.audience !== undefined) {
                updates.push(
                    api().project.set({ key: DbKeys.audience, value: spec.audience })
                        .then(() => { this.#audience = spec.audience!; })
                );
            }
            if (spec.style !== undefined) {
                updates.push(
                    api().project.set({ key: DbKeys.style, value: spec.style })
                        .then(() => { this.#style = spec.style!; })
                );
            }

            await Promise.all(updates);
            this.#lastUpdated = Date.now();
            log.info('[SpecStore] all spec fields updated');
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[SpecStore] updateAll() failed', err);
        }
    }
}

export const specStore = new SpecStore();