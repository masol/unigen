// packages/renderer/src/route/page/settings/kb/kbStore.svelte.ts
import { safeApi } from '$lib/utils/api';
import type { KbCollection, KbCollectionInput } from './kbTypes';

/**
 * 知识库 agent 接口形状。
 *
 * 主进程未接入时不能因为 TypeError 白屏；统一抛「服务暂不可用」，
 * 调用方可在 catch 中降级。
 */
type KbAgentApi = {
    listKnowledgeBases: () => Promise<KbCollection[]>;
    upsertKnowledgeBase: (
        input: { id?: string } & KbCollectionInput,
    ) => Promise<KbCollection>;
    deleteKnowledgeBase: (input: { id: string }) => Promise<{
        success: boolean;
    }>;
};

export function kbApi(): KbAgentApi {
    const api = safeApi() as unknown as {
        agent?: Partial<KbAgentApi>;
    };

    const agent = api.agent;
    if (
        !agent?.listKnowledgeBases ||
        !agent.upsertKnowledgeBase ||
        !agent.deleteKnowledgeBase
    ) {
        throw new Error('知识库服务暂不可用');
    }

    return agent as KbAgentApi;
}

class KnowledgeStore {
    collections = $state.raw<KbCollection[]>([]);
    loading = $state(false);
    error = $state('');
    saving = $state(false);

    get totalDocs(): number {
        return this.collections.reduce((sum, c) => sum + c.docs.length, 0);
    }

    async load(): Promise<void> {
        this.loading = true;
        this.error = '';

        try {
            const result = await kbApi().listKnowledgeBases();
            this.collections = Array.isArray(result) ? result : [];
        } catch (err) {
            // 完全使用真实数据：失败时保留空列表并暴露错误条，不注入示例数据。
            this.collections = [];
            this.error = err instanceof Error ? err.message : '知识库加载失败';
        } finally {
            this.loading = false;
        }
    }

    async create(input: KbCollectionInput): Promise<void> {
        this.saving = true;
        try {
            const created = await kbApi().upsertKnowledgeBase(input);
            this.collections = [created, ...this.collections];
        } finally {
            this.saving = false;
        }
    }

    async update(id: string, input: KbCollectionInput): Promise<void> {
        this.saving = true;
        try {
            const updated = await kbApi().upsertKnowledgeBase({ id, ...input });
            this.collections = this.collections.map((c) => (c.id === id ? updated : c));
        } finally {
            this.saving = false;
        }
    }

    async remove(id: string): Promise<void> {
        await kbApi().deleteKnowledgeBase({ id });
        this.collections = this.collections.filter((c) => c.id !== id);
    }

    /**
     * 在文件管理器中打开知识库目录。
     *
     * 复用 system.showItemInFolder，与 skill 的「打开技能目录」保持同一惯例。
     * 采用 ::global-xxx 占位符由主进程解析真实路径。
     */
    async openDirectory(): Promise<void> {
        await safeApi().system.showItemInFolder({ path: '::global-knowledge' });
    }
}

const KEY = Symbol.for('unigen.renderer.kbStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const kbStore: KnowledgeStore = ((globalThis as any)[KEY] ??= new KnowledgeStore());