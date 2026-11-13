import { safeApi } from '$lib/utils/api';
import type { KbCollection, KbCollectionInput, KbDoc } from './kbTypes';

/**
 * 知识库后端接口形状。
 *
 * 之所以在这里显式声明并做运行时校验，而不是直接写
 * `safeApi().knowledge.xxx`，是因为 knowledge 命名空间属于本项目
 * 新增能力，主进程尚未接入时不能因为 `TypeError` 白屏。
 * 通过 kbApi() 统一抛「服务暂不可用」，调用方可在 catch 中降级。
 */
type KbApi = {
    knowledge: {
        list: () => Promise<KbCollection[]>;
        create: (input: KbCollectionInput) => Promise<KbCollection>;
        update: (input: { id: string } & KbCollectionInput) => Promise<KbCollection>;
        remove: (input: { id: string }) => Promise<void>;
        pickDocuments: () => Promise<KbDoc[]>;
    };
};

export function kbApi(): KbApi {
    const api = safeApi() as unknown as { knowledge?: KbApi['knowledge'] };
    if (!api.knowledge) {
        throw new Error('知识库服务暂不可用');
    }
    return api as unknown as KbApi;
}

const DAY = 86_400_000;
const NOW = Date.now();

/**
 * 组件独立渲染时的兜底数据。
 *
 * 仅在 kbApi() 不可用时启用，用于让组件脱离主进程也能完整预览；
 * 真实环境加载成功后会整体替换，不会与真实数据混排。
 */
const MOCK_COLLECTIONS: KbCollection[] = [
    {
        id: 'col-employee-handbook',
        name: '员工手册',
        description:
            '公司制度、假期政策、报销流程与合规要求，回答人事相关问题时优先引用。',
        updatedAt: new Date(NOW - 2 * DAY).toISOString(),
        docs: [
            { id: 'd1', name: '员工手册-2024.pdf', size: 2_340_000, kind: 'pdf', status: 'ready' },
            { id: 'd2', name: '假期政策.md', size: 12_400, kind: 'md', status: 'ready' },
            { id: 'd3', name: '报销流程.docx', size: 88_200, kind: 'docx', status: 'ready' },
        ],
    },
    {
        id: 'col-resume',
        name: '我的简历',
        description:
            '工作经历、技能栈与代表项目，用于让 AI 按真实背景润色简历或准备面试。',
        updatedAt: new Date(NOW - 5 * DAY).toISOString(),
        docs: [
            { id: 'd4', name: '简历-中文版.pdf', size: 420_000, kind: 'pdf', status: 'ready' },
            { id: 'd5', name: '简历-英文版.pdf', size: 438_000, kind: 'pdf', status: 'ready' },
        ],
    },
    {
        id: 'col-writing-style',
        name: '写作偏好',
        description:
            '我习惯的措辞、句式与排版习惯，让 AI 生成的内容更接近我的语气。',
        updatedAt: new Date(NOW - 9 * DAY).toISOString(),
        docs: [
            { id: 'd6', name: '写作偏好清单.md', size: 6_800, kind: 'md', status: 'ready' },
            { id: 'd7', name: '常用术语表.txt', size: 3_200, kind: 'txt', status: 'ready' },
        ],
    },
    {
        id: 'col-team-wiki',
        name: '团队知识',
        description:
            '团队协作约定、项目背景与术语表，帮助 AI 在团队上下文中准确回答。',
        updatedAt: new Date(NOW - 14 * DAY).toISOString(),
        docs: [
            { id: 'd8', name: '团队协作约定.md', size: 15_600, kind: 'md', status: 'ready' },
            { id: 'd9', name: '项目背景介绍.pdf', size: 1_120_000, kind: 'pdf', status: 'converting' },
        ],
    },
];

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
            const result = await kbApi().knowledge.list();
            if (Array.isArray(result)) this.collections = result;
        } catch (err) {
            // 加载失败时退回示例数据，避免页面空白；错误条仍可见，用户可重试。
            this.collections = MOCK_COLLECTIONS;
            this.error = err instanceof Error ? err.message : '知识库加载失败';
        } finally {
            this.loading = false;
        }
    }

    async create(input: KbCollectionInput): Promise<void> {
        this.saving = true;
        try {
            const created = await kbApi().knowledge.create(input);
            this.collections = [created, ...this.collections];
        } finally {
            this.saving = false;
        }
    }

    async update(id: string, input: KbCollectionInput): Promise<void> {
        this.saving = true;
        try {
            const updated = await kbApi().knowledge.update({ id, ...input });
            this.collections = this.collections.map((c) => (c.id === id ? updated : c));
        } finally {
            this.saving = false;
        }
    }

    async remove(id: string): Promise<void> {
        await kbApi().knowledge.remove({ id });
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