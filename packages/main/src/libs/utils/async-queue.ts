// packages/main/src/libs/utils/async-queue.ts

/**
 * 轻量级串行异步队列，用于替代 concurrency=1 的 p-queue。
 *
 * 语义：
 *   - add(fn) 将任务排入队尾，返回 Promise；前一个任务 settle 后才启动下一个。
 *   - clear() 丢弃所有尚未开始的任务（已在执行的不受影响）。
 *   - 单个任务 reject 不会中断队列，后续任务仍会依次执行。
 *   - 不持有任何 timer / interval，不会阻止 Node.js 进程退出。
 */
export class SerializedQueue {
    #pending: Array<{
        fn: () => Promise<unknown>;
        resolve: (v: unknown) => void;
        reject: (e: unknown) => void;
    }> = [];
    #running = false;

    async add<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.#pending.push({
                fn,
                resolve: resolve as (v: unknown) => void,
                reject,
            });
            void this.#drain();
        });
    }

    /**
     * 丢弃所有尚未开始执行的排队任务。
     * 已在执行的任务不受影响，会继续完成。
     * 被丢弃的任务对应的 Promise 永远不会 settle（与 p-queue.clear() 行为一致）。
     */
    clear(): void {
        this.#pending = [];
    }

    async #drain(): Promise<void> {
        if (this.#running) return;
        this.#running = true;

        while (this.#pending.length > 0) {
            const task = this.#pending.shift()!;
            try {
                const result = await task.fn();
                task.resolve(result);
            } catch (err) {
                task.reject(err);
            }
        }

        this.#running = false;
    }
}