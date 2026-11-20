import { toast } from 'svelte-sonner';
import {
    disableCodeRuntime,
    enableCodeRuntime,
    listCodeRuntimes,
    setCodeRuntimeOption,
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
 *  - UI 内容（支持哪些语言、有哪些高级开关、test snippet 等）全部由服务器返回；
 *  - enable/disable 是每个环境独立的动作，没有全局总开关。
 */
class CodeRuntimeStore {
    entries = $state<CodeRuntimeEntry[]>([]);
    loading = $state(true);

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

    async setOption(id: string, key: string, value: boolean): Promise<void> {
        const entry = this.entries.find((e) => e.info.id === id);
        if (!entry) return;
        const prev = entry.state.options?.[key] ?? false;

        // 乐观更新
        this.entries = this.entries.map((r) =>
            r.info.id === id
                ? {
                    info: r.info,
                    state: {
                        ...r.state,
                        options: { ...(r.state.options ?? {}), [key]: value },
                    },
                }
                : r,
        );

        try {
            await setCodeRuntimeOption(id, key, value);
        } catch (e) {
            // 回滚
            this.entries = this.entries.map((r) =>
                r.info.id === id
                    ? {
                        info: r.info,
                        state: {
                            ...r.state,
                            options: { ...(r.state.options ?? {}), [key]: prev },
                        },
                    }
                    : r,
            );
            toast.error(toMessage(e, '保存失败'));
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