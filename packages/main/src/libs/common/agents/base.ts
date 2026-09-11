// base.agent.ts
import { CommonContext } from '$libs/common/context.js';
import { getSmartModel } from '$libs/model/index.js';
import { throwUnprcessable } from '$libs/utils/err.js';
import { dataCenter } from '$libs/utils/sys/data.js';
import { ToolLoopAgent, ToolSet, isStepCount } from 'ai';
import Handlebars, { type TemplateDelegate } from 'handlebars';

/**
 * 所有任务型 Agent 的基类（模板方法模式）
 */
export abstract class BaseAgent {
    private compiled: TemplateDelegate | null = null;

    /**
     * 加载并编译指定名称的 Handlebars 模板
     * @param templateName 模板文件名（不含 .md）
     */
    public async init(templateName: string[]): Promise<void> {
        if (this.compiled) {
            return;
        }
        const sysTpl = await dataCenter.readPrompt(...templateName);
        if (sysTpl) {
            this.compiled = Handlebars.compile(sysTpl);
        }
    }

    protected hasCompiled(): boolean {
        return !!this.hasCompiled;
    }

    /**
     * 获取编译后的模板渲染函数（供子类在 loadSystem 中使用）
     */
    protected getCompiled(): TemplateDelegate {
        if (!this.compiled) {
            throwUnprcessable("无法加载target.md提示词模板。")
        }
        return this.compiled;
    }

    /**
     * 抽象方法：构建系统提示词（子类必须实现）
     * 通常内部调用 this.init(templateName) 然后渲染
     */
    protected abstract loadSystem(cctx: CommonContext): string;
    protected abstract loadPrompt(cctx: CommonContext): string;


    /**
     * 抽象方法：提供该 Agent 所使用的工具集（子类必须实现）
     */
    protected abstract getTools(cctx: CommonContext): ToolSet;

    /**
     * 通用执行入口（可被子类重写）
     * 封装 ToolLoopAgent 的初始化、生成和通知流程
     */
    async run(cctx: CommonContext): Promise<string> {
        const [system, prompt] = await Promise.all([this.loadSystem(cctx), this.loadPrompt(cctx)]);
        const tools = this.getTools(cctx);

        const agent = new ToolLoopAgent({
            model: getSmartModel(undefined, cctx.ctx),
            instructions: system,
            stopWhen: isStepCount(cctx.storage.config.getMaxSteps()),
            tools,
        });

        const result = await agent.generate({
            prompt
        });

        cctx.ctx.debug('result=', result);
        return result.text ?? "";
    }
}