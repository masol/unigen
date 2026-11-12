import { safeApi } from '$lib/utils/api';
import type { SkillSearchItem } from '@app/main/types';

function readSource(metadata: Record<string, unknown>): string {
    const value = metadata.source;
    return typeof value === 'string' ? value : '';
}

class SkillStore {
    items = $state.raw<SkillSearchItem[]>([]);
    loading = $state(false);
    error = $state('');
    query = $state('');
    hasMore = $state(false);
    installing = $state(false);
    removingIds = $state<string[]>([]);

    private requestSeq = 0;

    filteredItems = $derived.by(() => {
        const q = this.query.trim().toLowerCase();
        if (!q) return this.items;

        return this.items.filter((skill) => {
            const source = readSource(skill.metadata);
            return [skill.id, skill.name, skill.description, skill.path, source]
                .join(' ')
                .toLowerCase()
                .includes(q);
        });
    });

    async load(): Promise<void> {
        const seq = ++this.requestSeq;

        this.loading = true;
        this.error = '';

        try {
            const result = await safeApi().agent.searchSkills({
                query: '',
                limit: 100,
                offset: 0,
            });

            if (seq !== this.requestSeq) return;

            this.items = result.items;
            this.hasMore = result.hasMore;
        } catch (err) {
            if (seq !== this.requestSeq) return;
            this.error = err instanceof Error ? err.message : '技能列表加载失败';
        } finally {
            if (seq === this.requestSeq) {
                this.loading = false;
            }
        }
    }

    /**
     * 安装技能。
     *
     * 来源选择与解压安装都由主进程完成；安装成功后由客户端主动刷新列表。
     *
     * @returns 是否真正完成安装；用户取消时返回 false。
     * @throws 安装失败时抛出错误，供调用方 toast 展示。
     */
    async install(): Promise<boolean> {
        if (this.installing) return false;

        this.installing = true;
        try {
            const result = await safeApi().agent.installSkill();

            // 防御：API 层在业务失败场景下可能返回 null，
            // 不能直接访问 result.canceled。
            if (!result) {
                throw new Error('技能安装失败');
            }

            if (result.canceled) return false;

            await this.load();
            return true;
        } finally {
            this.installing = false;
        }
    }

    async remove(id: string): Promise<void> {
        if (this.removingIds.includes(id)) return;

        this.removingIds = [...this.removingIds, id];
        try {
            await safeApi().agent.deleteSkill({ id });
            this.items = this.items.filter((item) => item.id !== id);
        } finally {
            this.removingIds = this.removingIds.filter((item) => item !== id);
        }
    }

    isRemoving(id: string): boolean {
        return this.removingIds.includes(id);
    }

    async openDirectory(): Promise<void> {
        await safeApi().system.showItemInFolder({ path: "::global-skill" });
    }
}

const KEY = Symbol.for('unigen.renderer.skillStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const skillStore: SkillStore = ((globalThis as any)[KEY] ??= new SkillStore());