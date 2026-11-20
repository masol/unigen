import { longTaskStore } from '$lib/store/ui/longTask.svelte';
import { toast } from 'svelte-sonner';
import {
    disableCodeRuntime,
    enableCodeRuntime,
    listCodeRuntimes,
    subscribeCodeRuntimeEvents,
    testCodeRuntime,
} from './service';
import type {
    CodeRuntimeEntry,
    CodeRuntimeTestResult,
} from './types';

function toMessage(e: unknown, fallback: string): string {
    return e instanceof Error ? e.message : fallback;
}

/**
 * 代码执行面板的集中状态。
 *
 * 关键概念：
 *  - 状态由主进程持有，store 只在首次挂载时拉一次，之后靠事件流同步；
 *  - UI 内容（支持哪些语言、test snippet 等）全部由服务器返回；
 *  - enable/disable 是每个环境独立的动作，没有全局总开关。
 */
class CodeRuntimeStore {
    entries = $state<CodeRuntimeEntry[]>([]);
    loading = $state(true);

    /** 处于 preparing 状态的环境数 —— 供长时任务角标显示 */
    readonly preparingCount = $derived.by(
        () => this.entries.filter((e) => e.state.status === 'preparing').length,
    );

    #loaded = false;
    // eslint-disable-next-line no-unused-private-class-members
    #unsubscribe?: () => void;

    async load(): Promise<void> {
        if (this.#loaded) return;
        this.loading = true;
        try {
            this.entries = await listCodeRuntimes();
            this.#unsubscribe ??= subscribeCodeRuntimeEvents((event) => {
                this.entries = this.entries.map((row) =>
                    row.info.id === event.id
                        ? { info: row.info, state: event.state }
                        : row,
                );
            });
            this.#loaded = true;
        } catch (e) {
            toast.error(toMessage(e, '加载代码环境失败'));
            this.entries = [];
        } finally {
            this.loading = false;
        }
    }

    async setEnabled(id: string, next: boolean): Promise<void> {
        if (next) {
            try {
                await enableCodeRuntime(id);
            } catch (e) {
                toast.error(toMessage(e, '启用失败'));
            }
        } else {
            try {
                await disableCodeRuntime(id);
            } catch (e) {
                toast.error(toMessage(e, '停用失败'));
            }
        }
    }

    async test(
        id: string,
        code: string,
    ): Promise<CodeRuntimeTestResult | null> {
        try {
            return await testCodeRuntime(id, code);
        } catch (e) {
            toast.error(toMessage(e, '测试失败'));
            return null;
        }
    }
}

const KEY = Symbol.for('unigen.renderer.codeRuntimeStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const codeRuntimeStore: CodeRuntimeStore = ((globalThis as any)[KEY] ??=
    new CodeRuntimeStore());

// 向长时任务汇总注册：'code-runtime' key 对应 setting.svelte 中的 longTaskKey
longTaskStore.register(
    'code-runtime',
    () => codeRuntimeStore.preparingCount,
);