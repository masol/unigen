import { ToolSet, tool } from 'ai';
import { clarifyInputSchema, clarifyOutputSchema, userClarifyTool } from '../clarify/index.js';
import { CommonContext } from '../context.js';
import { ExecOutput, execInputSchema, execOutputSchema } from '../storage/type/tast.js';
import { doTask } from '../task/index.js';
import { BaseAgent } from './base.js';

export class TargetLoop extends BaseAgent {
    protected loadSystem(cctx: CommonContext): string {
        const compiled = this.getCompiled();
        // @todo: loadHistroy.
        return compiled(cctx.getGoalHistory());
    }

    protected loadPrompt(cctx: CommonContext): string {
        return cctx.ctx.cmd.body;
    }

    protected getTools(cctx: CommonContext): ToolSet {
        return {
            clarify: tool({
                description: '当用户请求信息不足（目标模糊/缺少关键参数/存在多种解读）时，向用户提出具体追问以收集必要信息。参数 question 必须是一句明确的、可回答的追问。',
                inputSchema: clarifyInputSchema,
                outputSchema: clarifyOutputSchema,
                execute: async (input) => {
                    return await userClarifyTool.callTool(input, cctx);
                },
            }),
            exec: tool({
                description: '将复杂任务委托给子Agent执行。用于需要调研/分析/创作/多步骤流程/专业知识的任务，或对历史任务的修改补充。',
                inputSchema: execInputSchema,
                outputSchema: execOutputSchema,
                execute: async ({ goal, target_user, use_scenario, alternatives = "", requirements = [], context = '' }): Promise<ExecOutput> => {
                    const result = await doTask({ goal, target_user, use_scenario, alternatives, requirements, context }, cctx);
                    return result;
                },
            }),
        };
    }
}
