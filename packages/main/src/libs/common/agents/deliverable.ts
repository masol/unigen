import { CommonContext } from '$libs/common/context.js';
import { ToolSet } from 'ai';
import { BaseAgent } from './base.js';

export class DeliverableClassify extends BaseAgent {
    protected loadSystem(cctx: CommonContext): string {
        const compiled = this.getCompiled();
        // @todo: loadHistroy.
        return compiled(cctx.getGoalHistory());
    }

    protected loadPrompt(cctx: CommonContext): string {
        const goal = cctx.storage.goal.getCurgoal();
        return JSON.stringify(goal, null, 2)
    }

    protected getTools(cctx: CommonContext): ToolSet {
        void (cctx)
        return {
        }
    }
}
