import { throwNotfound, throwPrecondition } from '$libs/utils/err.js';
import { Capability } from '$types/blueprint/capability.js';
import type { IRunnerContext } from '$types/blueprint/context.js';
import Logger from 'electron-log/main.js';
import { DirectedGraph } from 'graphology';
import { forEachTopologicalGeneration, hasCycle } from 'graphology-dag';
import { BaseFunctor } from './base.js';

export class DagFunctor extends BaseFunctor {
    constructor(capa: Capability, protected dag: DirectedGraph) {
        super(capa);
    }

    private async execTask(ctx: IRunnerContext, id: string): Promise<string> {
        const runner = ctx.loadFunctor(id);
        if (runner) {
            return await runner.run(ctx);
        } else {
            throwNotfound(`无法加载id为${id}的能力对象。`)
        }
    }

    /**
     * 前置校验图的合法性
     */
    private validateGraph(): void {
        // 1. 空图检查
        if (this.dag.order === 0) {
            const msg = '工作流中没有任何节点，无法执行。';
            Logger.error(msg);
            throwPrecondition(msg);
        }

        if (hasCycle(this.dag)) {
            const msg = '工作流初始化失败：检测到图结构中存在死循环（循环依赖）！';
            Logger.error(msg);
            throwPrecondition(msg);
        }

        // @todo: 当前图中如果有孤儿节点(Disconnected Nodes:出入度都为0)，会在第一代中将其执行，这里是否预检查及处理？
    }

    // 3. 核心运行函数：按“代”并行
    async doTask(ctx: IRunnerContext): Promise<string> {
        // 收集计算出的“代”队列
        const generations: string[][] = [];

        this.validateGraph();

        // 状态检查：如果校验完就已经被取消了，直接退出
        if (ctx.isAborted) return "";

        forEachTopologicalGeneration(this.dag, (generation) => {
            // generation 是一个包含当前代所有节点 ID 的数组
            generations.push(generation);
        });

        Logger.debug('--- 开始按代异步并行执行 ---', generations);

        // 最终 message 只取「最后一代」的返回值：
        //  - DAG 中间代之间的数据由 io 契约承载，返回值没有约定用途；
        //  - 最后一代通常承载对外输出，其文本即为 DAG 的最终 message。
        let finalResults: string[] = [];

        // 顺序遍历每一代
        for (let i = 0; i < generations.length; i++) {
            // 1. 快速检查点：进入新一代前，如果已经被终止，则直接退出
            if (ctx.isAborted) {
                Logger.warn(`[第 ${i + 1} 代] 检测到工作流已被终止，放弃执行后续代。中断类型:`);
                break;
            }

            const currentGen = generations[i];
            Logger.debug(`\n[第 ${i + 1} 代] 准备并行执行节点: ${JSON.stringify(currentGen)}`);

            // 2. 映射任务：建议修改 execTask 签名，将 ctx 或 ctx.signal 传入，以便底层任务能感知取消
            const promises = currentGen.map(id => this.execTask(ctx, id));

            // 1. 提前定义好监听函数和 reject 引用
            let abortHandler: (() => void) | null = null;
            try {
                const results: string[] = await Promise.race([
                    Promise.all(promises),
                    new Promise<never>((_, _reject) => {
                        // 初始化时已触发abort，仅强制杀死才拒绝
                        if (ctx.signal.aborted) {
                            return;
                        }

                        abortHandler = () => {
                            // 仅强制杀死时才抛出中断错误
                        };

                        ctx.signal.addEventListener('abort', abortHandler);
                    })
                ]);

                // 仅最后一代的返回值是本次 DAG 的最终 message。
                // 中间代返回值不予保留（其数量与谁是谁无法向调用方承诺）。
                if (i === generations.length - 1) {
                    finalResults = results;
                }

                Logger.debug(`[第 ${i + 1} 代] 所有节点执行完毕。`);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                if (error?.code === 'ERR_ABORTED' || error?.name === 'AbortError') {
                    Logger.warn(`[第 ${i + 1} 代] 执行中收到终止信号。`);
                    return "";
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
        if (ctx.isAborted) {
            Logger.debug('\n--- DAG 任务因终止信号退出 ---');
            return "";
        }

        Logger.debug('\n--- DAG 所有任务执行完成 ---');

        // 过滤空串，避免多个"无输出"节点拼出一串无意义的 \n\n。
        return finalResults
            .filter((s): s is string => typeof s === "string" && s.length > 0)
            .join("\n\n");
    }
}