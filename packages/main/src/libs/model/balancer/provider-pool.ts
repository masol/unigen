import fastq, { queueAsPromised } from 'fastq';

type Job = () => Promise<unknown>;

/** slot 持有句柄:调用 release() 主动释放;超时会自动释放。 */
export interface SlotHandle {
    /** 主动释放 slot(幂等,多次调用无副作用) */
    release: () => void;
    /** 是否已释放 */
    readonly released: boolean;
}

/** 默认兜底超时:30 分钟。用于流式/长任务防止 slot 泄漏。 */
export const DEFAULT_HOLD_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Provider 级并发控制器。
 * fastq.promise 保证:同时最多 concurrency 个 job 在跑,
 * 每个 job 的 Promise settle(成功/失败)后自动释放并调度下一个。
 */
export class ProviderLimiter {
    private q: queueAsPromised<Job, unknown>;

    constructor(public concurrency: number) {
        this.q = fastq.promise<unknown, Job>((job) => job(), concurrency);
    }

    setConcurrency(n: number) {
        this.concurrency = n;
        this.q.concurrency = n;
    }

    /**
     * 提交一个"有明确结束"的任务(非流式)。
     * job 的 Promise settle 即自动释放 slot。
     */
    run<T>(job: () => PromiseLike<T>): Promise<T> {
        return this.q.push(() => Promise.resolve(job())) as Promise<T>;
    }

    /**
     * 占用一个 slot 并返回句柄,由调用方决定何时 release(用于流式/长任务)。
     * 内置超时兜底:超过 timeoutMs 仍未 release,则强制释放,避免泄漏。
     *
     * @param timeoutMs 兜底超时(毫秒),默认 15 分钟。视频等长任务可传更大值。
     * @param onTimeout 超时强制释放时的回调(用于日志告警)。
     * @returns 进入执行(拿到 slot)后 resolve 的句柄。
     */
    acquire(
        timeoutMs: number = DEFAULT_HOLD_TIMEOUT_MS,
        onTimeout?: () => void,
    ): Promise<SlotHandle> {
        return new Promise<SlotHandle>((resolveHandle) => {
            // 把"持有 slot"包装成一个 job:job 的 Promise 直到 release/超时才 settle
            this.q
                .push(() => {
                    let released = false;
                    let timer: ReturnType<typeof setTimeout> | undefined;

                    const settle = new Promise<void>((resolveJob) => {
                        const doRelease = () => {
                            if (released) return;
                            released = true;
                            if (timer) clearTimeout(timer);
                            resolveJob(); // job 结束 → fastq 释放 slot
                        };

                        // 超时兜底
                        timer = setTimeout(() => {
                            if (!released) {
                                try {
                                    onTimeout?.();
                                } finally {
                                    doRelease();
                                }
                            }
                        }, timeoutMs);
                        // 不阻止进程退出
                        if (typeof timer === 'object' && 'unref' in timer) {
                            (timer as { unref?: () => void }).unref?.();
                        }

                        const handle: SlotHandle = {
                            release: doRelease,
                            get released() {
                                return released;
                            },
                        };
                        // 已经进入执行(拿到 slot),把句柄交给调用方
                        resolveHandle(handle);
                    });

                    return settle;
                })
                .catch(() => void 0);
        });
    }

    /** 当前排队(未开始)的任务数 */
    get pending(): number {
        return this.q.length();
    }

    /** 当前正在执行的任务数 */
    get running(): number {
        return this.q.running();
    }

    /** 剩余容量(用于负载排序) */
    get remaining(): number {
        return this.concurrency - this.running - this.pending;
    }
}