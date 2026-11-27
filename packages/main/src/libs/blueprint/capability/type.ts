import type { IRunnerContext } from "$types/blueprint/context.js";


export interface ICapaFunctor {
    readonly id: string;
    /**
     * 执行能力并返回本次运行的"最终 message"。
     * 约定：无可供调用方消费的文本时返回空字符串 ""，
     * 不使用 undefined/null 以免调用方增加额外的判空分支。
     *
     * 注意：返回的是"结果文本"，与通过 ctx.notify / ctx.report
     * 上报的中间过程（进度、思考、工具调用等）互不干扰。
     */
    run(ctx: IRunnerContext): Promise<string>;
}