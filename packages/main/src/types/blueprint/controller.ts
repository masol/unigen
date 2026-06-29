import type { IWorkflowContext } from "./context.js";
import type { RunState } from "./state.js";

export interface IWorkflowController {
    readonly state: RunState;
    /** 
     * 获取对外的只读上下文实例
     */
    readonly context: IWorkflowContext;

    /**
     * 触发工作流终止
     * @param force 是否强制杀死（true 截断排队，false 优雅停止）
     */
    abort(force?: boolean): Promise<void>;


    /**
     * 启动工作流
     * 返回后工作流处于启动状态，否则会抛出异常。
     */
    start(): Promise<void>;
}