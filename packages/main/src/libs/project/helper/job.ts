// import { ensureCurrentPrj } from '$libs/utils/api.js';
import {
    createDatabase, type WorkmaticDb, type WorkmaticClient,
    type WorkmaticWorker, type AddJobOptions, type AddJobResult,
    type AddManyResult, type JobStats, type JobStatus
} from 'workmatic'
// import { PrjDB } from '../controllers/drizzle.js';
import type { Database } from 'better-sqlite3'
import { ORPCError } from '@orpc/server';
import { COMMON_ORPC_ERROR_DEFS } from '@orpc/client';
import { taskLife } from '$libs/utils/tapable/tasklife.js';
import Logger from 'electron-log/main.js';

export type JobHandle = {
    client: WorkmaticClient,
    worker: WorkmaticWorker
}

export class PrjJob {
    readonly workmaticDb: WorkmaticDb;
    private handles: Record<string, JobHandle> = {}
    constructor(sqlite: Database) {
        // const prj = ensureCurrentPrj();

        this.workmaticDb = createDatabase({ db: sqlite });
        // const queueName = "llm";
        // this.llmClient = createClient({
        //     db: this.workmaticDb,
        //     queue: queueName
        // });

        // //@todo: 根据配置更新WORKER并发限制。
        // this.llmWorker = createWorker({
        //     db: this.workmaticDb,
        //     queue: queueName,
        //     concurrency: 3,        // 并发控流
        //     timeoutMs: 600000,     // 大模型超时时间 10 分钟
        //     leaseMs: 45000,        // 租约锁 45 秒
        // });
    }

    async init() {
        // 将控制权暴露出去，把自身实例传给插件
        await taskLife.hooks.onRegisterWorkers.promise(this);
    }

    has(queue: string) {
        return !!this.handles[queue];
    }

    get(queue: string): JobHandle | undefined {
        return this.handles[queue];
    }

    ensure(queue: string): JobHandle {
        const handle = this.get(queue);
        if (!handle) {
            throw new ORPCError(COMMON_ORPC_ERROR_DEFS.NOT_FOUND.message, {
                status: COMMON_ORPC_ERROR_DEFS.TOO_MANY_REQUESTS.status,
                message: `未注册的任务队列：${queue}`
            })
        }
        return handle;
    }

    async add<TPayload = unknown>(qname: string, payload: TPayload, options?: AddJobOptions): Promise<AddJobResult> {
        const handle = this.ensure(qname);
        const context = {
            queue: qname,
            payload
        };

        // 1. 走流水线：依次执行数据转换（串行异步，插件可以在这里改写 context.payload）
        await taskLife.hooks.transform.promise(context);

        // 2. 广播入库通知：数据完全定型，转为只读，并发通知（UI 占位等）
        await taskLife.hooks.beforeAdd.promise(Object.freeze({ ...context }));

        return await handle.client.add(context.payload, options)
    }

    async addMany<TPayload = unknown>(qname: string, payloads: TPayload[], options?: AddJobOptions): Promise<AddManyResult> {
        const handle = this.ensure(qname);
        return await handle.client.addMany(payloads, options)
    }

    /** Get job statistics */
    async stats(qname: string): Promise<JobStats> {
        const handle = this.ensure(qname);
        return await handle.client.stats()
    }

    /** Clear all jobs from the queue */
    async clear(qname: string, options?: {
        status?: JobStatus;
    }): Promise<number> {
        const handle = this.ensure(qname);
        return await handle.client.clear(options)
    }

    reg(queue: string, handle: JobHandle) {
        this.handles[queue] = handle;
    }

    /**
     * 优雅停机（Graceful Shutdown）
     * 适用于：用户主动切换项目、应用常规关闭
     */
    async gracefulShutdown(): Promise<void> {
        Logger.debug('⏳ [ProjectJob] 正在优雅关闭任务管理子系统...');

        const tasks: Promise<void>[] = [];
        try {
            // 【第一步】调用 worker.stop() 
            Object.values(this.handles).forEach(handle => {
                tasks.push(handle.worker.stop());
            })
            await Promise.all(tasks);
            Logger.debug('✅ [ProjectJob] 所有 Worker 已安全排出并停止。');
        } catch (error) {
            Logger.error('❌ [ProjectJob] 优雅停机过程中遇到错误:', error);
        }
    }

    /**
    * 强制闪退（Force Immediate Shutdown）
    * 适用于：用户强退、Electron before-quit、追求瞬间响应且不等大模型跑完
    */
    async forceShutdown(): Promise<void> {
        Logger.debug('[ProjectJob] 正在执行强制闪退...');

        try {
            // 1. 先暂停 Worker（源码注：pause processing (stops claiming new jobs)）
            // 确保它不再发起新的 SQLite 读取请求
            Object.values(this.handles).forEach(handle => {
                handle.worker.pause();
            })
        } catch (err) {
            Logger.error('⚠️ [ProjectJob] 强制回滚状态失败:', err);
        }
    }
}