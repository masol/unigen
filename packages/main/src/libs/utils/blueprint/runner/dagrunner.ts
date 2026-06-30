import type { IRunnerContext } from '$types/blueprint/context.js';
import Logger from 'electron-log/main.js';
import { DirectedGraph } from 'graphology'
import { forEachTopologicalGeneration } from 'graphology-dag';
import { delay } from '../../promise.js';
import type { ICapaRunner } from './type.js';

export class DagRunner implements ICapaRunner {
    constructor(protected dag: DirectedGraph) {
    }

    private async execTask(id: string): Promise<void> {
        await delay(Math.random() * 10000);
        Logger.debug(`runnig id:${id}`);
    }

    // 3. 核心运行函数：按“代”并行
    async run(ctx: IRunnerContext): Promise<void> {
        // 收集计算出的“代”队列
        const generations: string[][] = [];

        forEachTopologicalGeneration(this.dag, (generation) => {
            // generation 是一个包含当前代所有节点 ID 的数组
            generations.push(generation);
        });

        Logger.debug('--- 开始按代异步并行执行 ---', generations);

        // 顺序遍历每一代
        for (let i = 0; i < generations.length; i++) {
            // 1. 快速检查点：进入新一代前，如果已经被终止，则直接退出
            if (ctx.isAborted || ctx.isForceKilled) {
                Logger.warn(`[第 ${i + 1} 代] 检测到工作流已被终止，放弃执行后续代。中断类型: ${ctx.isForceKilled ? '强制杀死' : '普通终止'}`);
                break;
            }

            const currentGen = generations[i];
            Logger.debug(`\n[第 ${i + 1} 代] 准备并行执行节点: ${JSON.stringify(currentGen)}`);

            // 2. 映射任务：建议修改 execTask 签名，将 ctx 或 ctx.signal 传入，以便底层任务能感知取消
            const promises = currentGen.map(id => this.execTask(id));

            // 1. 提前定义好监听函数和 reject 引用
            let abortHandler: (() => void) | null = null;
            try {

                await Promise.race([
                    Promise.all(promises),
                    new Promise<never>((_, reject) => {
                        // 初始化时已触发abort，仅强制杀死才拒绝
                        if (ctx.signal.aborted) {
                            if (ctx.isForceKilled) {
                                return reject(ctx.signal.reason);
                            }
                            // 非强制终止，不reject，让Promise.all自行走完
                            return;
                        }

                        abortHandler = () => {
                            // 仅强制杀死时才抛出中断错误
                            if (ctx.isForceKilled) {
                                reject(ctx.signal.reason);
                            }
                        };

                        ctx.signal.addEventListener('abort', abortHandler);
                    })
                ]);

                Logger.debug(`[第 ${i + 1} 代] 所有节点执行完毕。`);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                if (error?.code === 'ERR_ABORTED' || error?.name === 'AbortError') {
                    Logger.warn(`[第 ${i + 1} 代] 执行中收到终止信号。`);
                    return;
                }
                throw error;
            } finally {
                // 3. 🎯 核心清理逻辑：无论这一代是成功还是失败，只要绑定了监听器，立刻解绑
                if (abortHandler) {
                    ctx.signal.removeEventListener('abort', abortHandler);
                    Logger.debug(`[第 ${i + 1} 代] 内存清理：已成功移除 AbortSignal 监听器。`);
                }
            }
        }

        // 最终状态检查
        if (ctx.isAborted || ctx.isForceKilled) {
            Logger.debug('\n--- DAG 任务因终止信号退出 ---');
        } else {
            Logger.debug('\n--- DAG 所有任务执行完成 ---');
        }
    }
}