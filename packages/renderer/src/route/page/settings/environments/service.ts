import type {
    EnvironmentDetail,
    EnvironmentSummary,
    SshTarget,
} from './types';

/**
 * 自有环境对外接口。
 *
 * 一致性约定：
 *  - 一律以环境 id 为入参，统一"环境类型"维度，不为每种环境拆 procedure；
 *  - 环境类型 (kind) 决定详情页配置组件（见 registry.ts），数据与组件解耦；
 *  - 连接方式（local / ssh）是环境本身的属性，所有环境共用这一组设置。
 *
 * 下方是 fake 数据，主进程接入后按相同形状替换即可。
 */

const SUMMARIES: EnvironmentSummary[] = [
    {
        id: 'llamacpp',
        kind: 'llamacpp',
        name: 'llama.cpp',
        description: '本地推理与嵌入模型服务',
        transport: 'local',
        status: 'unknown',
        autoSync: true,
    },
];

const DETAILS = new Map<string, EnvironmentDetail>();

function ensureDetail(id: string): EnvironmentDetail | undefined {
    const summary = SUMMARIES.find((s) => s.id === id);
    if (!summary) return undefined;
    if (!DETAILS.has(id)) {
        DETAILS.set(id, {
            ...summary,
            components: [
                { id: 'server', name: 'llama-server', status: 'missing' },
                { id: 'embed', name: '嵌入模型', status: 'missing' },
            ],
            config: {
                modelPath: '',
                port: 8080,
                contextSize: 4096,
                gpuLayers: 0,
            },
        });
    }
    return DETAILS.get(id)!;
}

// ── 对外接口 ──

export async function listEnvironments(): Promise<EnvironmentSummary[]> {
    await new Promise((r) => setTimeout(r, 200));
    return SUMMARIES.map((s) => ({ ...s }));
}

export async function getEnvironmentDetail(
    id: string,
): Promise<EnvironmentDetail> {
    await new Promise((r) => setTimeout(r, 150));
    const d = ensureDetail(id);
    if (!d) throw new Error(`未知的环境: ${id}`);
    return {
        ...d,
        components: d.components.map((c) => ({ ...c })),
        config: { ...d.config },
    };
}

export async function probeEnvironment(
    id: string,
): Promise<EnvironmentSummary> {
    await new Promise((r) => setTimeout(r, 800));
    const summary = SUMMARIES.find((s) => s.id === id);
    if (!summary) throw new Error(`未知的环境: ${id}`);
    summary.status = summary.transport === 'local' ? 'online' : 'offline';
    const d = DETAILS.get(id);
    if (d) d.status = summary.status;
    return { ...summary };
}

export async function updateEnvironmentConnection(
    id: string,
    patch: { transport: 'local' | 'ssh'; ssh?: SshTarget },
): Promise<void> {
    const summary = SUMMARIES.find((s) => s.id === id);
    if (!summary) throw new Error(`未知的环境: ${id}`);
    summary.transport = patch.transport;
    summary.ssh = patch.ssh;
    summary.status = 'unknown';
    const d = DETAILS.get(id);
    if (d) {
        d.transport = patch.transport;
        d.ssh = patch.ssh;
        d.status = 'unknown';
    }
}

export async function setEnvironmentAutoSync(
    id: string,
    value: boolean,
): Promise<void> {
    const summary = SUMMARIES.find((s) => s.id === id);
    if (!summary) throw new Error(`未知的环境: ${id}`);
    summary.autoSync = value;
    const d = DETAILS.get(id);
    if (d) d.autoSync = value;
}

export async function updateEnvironmentConfig(
    id: string,
    patch: Record<string, unknown>,
): Promise<void> {
    const d = DETAILS.get(id);
    if (!d) throw new Error(`未知的环境: ${id}`);
    d.config = { ...d.config, ...patch };
}