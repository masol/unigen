import { toast } from 'svelte-sonner';
import {
    getEnvironmentDetail,
    listEnvironments,
    probeEnvironment,
    setEnvironmentAutoSync,
    updateEnvironmentConfig,
    updateEnvironmentConnection,
} from './service';
import type {
    EnvironmentDetail,
    EnvironmentSummary,
    SshTarget,
} from './types';

function toMessage(e: unknown, fallback: string): string {
    return e instanceof Error ? e.message : fallback;
}

class EnvironmentsStore {
    summaries = $state<EnvironmentSummary[]>([]);
    listLoading = $state(true);

    details = $state<Record<string, EnvironmentDetail>>({});
    detailLoading = $state<Record<string, boolean>>({});

    #listLoaded = false;

    /** 列表页首次进入拉一次；重入不重复请求（依赖事件流刷新状态）。 */
    async loadList(): Promise<void> {
        if (this.#listLoaded) return;
        this.listLoading = true;
        try {
            this.summaries = await listEnvironments();
            this.#listLoaded = true;
        } catch (e) {
            toast.error(toMessage(e, '加载环境失败'));
            this.summaries = [];
        } finally {
            this.listLoading = false;
        }
    }

    async loadDetail(id: string): Promise<void> {
        if (this.details[id]) return;
        this.detailLoading[id] = true;
        try {
            this.details[id] = await getEnvironmentDetail(id);
        } catch (e) {
            toast.error(toMessage(e, '加载环境详情失败'));
        } finally {
            this.detailLoading[id] = false;
        }
    }

    async probe(id: string): Promise<void> {
        const prev = this.summaries.find((s) => s.id === id);
        if (!prev) return;
        this.patchSummary(id, { status: 'checking', error: undefined });
        try {
            const next = await probeEnvironment(id);
            this.patchSummary(id, next);
            if (this.details[id]) {
                this.details[id] = { ...this.details[id], ...next };
            }
        } catch (e) {
            const message = toMessage(e, '检测失败');
            this.patchSummary(id, { status: 'error', error: message });
            toast.error(message);
        }
    }

    async setAutoSync(id: string, value: boolean): Promise<void> {
        const prev = this.summaries.find((s) => s.id === id)?.autoSync ?? false;
        this.patchSummary(id, { autoSync: value });
        if (this.details[id]) {
            this.details[id] = { ...this.details[id], autoSync: value };
        }
        try {
            await setEnvironmentAutoSync(id, value);
        } catch (e) {
            this.patchSummary(id, { autoSync: prev });
            if (this.details[id]) {
                this.details[id] = { ...this.details[id], autoSync: prev };
            }
            toast.error(toMessage(e, '保存失败'));
        }
    }

    async updateConnection(
        id: string,
        transport: 'local' | 'ssh',
        ssh?: SshTarget,
    ): Promise<void> {
        try {
            await updateEnvironmentConnection(id, { transport, ssh });
            this.patchSummary(id, { transport, ssh, status: 'unknown' });
            if (this.details[id]) {
                this.details[id] = {
                    ...this.details[id],
                    transport,
                    ssh,
                    status: 'unknown',
                };
            }
        } catch (e) {
            toast.error(toMessage(e, '更新连接失败'));
        }
    }

    async updateConfig(
        id: string,
        patch: Record<string, unknown>,
    ): Promise<void> {
        try {
            await updateEnvironmentConfig(id, patch);
            if (this.details[id]) {
                this.details[id] = {
                    ...this.details[id],
                    config: { ...this.details[id].config, ...patch },
                };
            }
        } catch (e) {
            toast.error(toMessage(e, '保存配置失败'));
        }
    }

    private patchSummary(
        id: string,
        patch: Partial<EnvironmentSummary>,
    ): void {
        this.summaries = this.summaries.map((s) =>
            s.id === id ? { ...s, ...patch } : s,
        );
    }
}

const KEY = Symbol.for('unigen.renderer.environmentsStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const environmentsStore: EnvironmentsStore = ((globalThis as any)[KEY] ??=
    new EnvironmentsStore());