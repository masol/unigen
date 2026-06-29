import { PrjDB } from '$libs/project/controllers/drizzle.js';
import { IProjectContext } from '$libs/project/type.js';
import { IWorkflowContext } from '$types/blueprint/context.js';
import log from 'electron-log/main.js';


export class WorkflowContext implements IWorkflowContext {
    readonly signal: AbortSignal;
    readonly prj: IProjectContext;
    readonly prjdb: PrjDB;

    private readonly abortController: AbortController;
    #isForceKilled: boolean = false;

    constructor(prj: IProjectContext) {
        this.prj = prj;
        this.prjdb = PrjDB.ensure(prj);

        // 初始化原生的 AbortController
        this.abortController = new AbortController();
        this.signal = this.abortController.signal;

        // 配置 electron-log 的作用域 (Scope)
        // 这样该工作流实例的所有日志都会自动带上 [workflow-id] 前缀，方便排查问题
        log.scope(`workflow-${this.prj.path}`);
    }

    // ==========================================
    // 🚦 状态检查点
    // ==========================================

    /** 快照检查点：判断当前工作流是否已经被终止 */
    get isAborted(): boolean {
        return this.signal.aborted;
    }

    /** 快照检查点：判断是否属于“强制杀死”状态 */
    get isForceKilled(): boolean {
        return this.#isForceKilled;
    }

    /**
     * 内部或外部触发取消的方法（配合宿主环境使用）
     * @param force 是否属于强制杀死
     */
    triggerAbort(force: boolean = false): void {
        if (force) {
            this.#isForceKilled = true;
        }
        this.abortController.abort();
        this.warn(`Workflow execution was aborted. ForceKilled: ${force}`);
    }

    set(key: string, value: unknown): void {
        this.prjdb.set(key, value);
    }

    get<T>(key: string): T | null {
        return this.prjdb.get<T>(key);
    }

    remove(key: string): void {
        this.prjdb.remove(key);
    }

    // ==========================================
    // 📝 日志接口 (适配 electron-log) 
    //  @TODO: 适配通知接口，以通知主进程的日志过程。(是否应该取名step?)
    // ==========================================

    info(message: string, ...args: unknown[]): void {
        log.info(message, ...args);
    }

    warn(message: string, ...args: unknown[]): void {
        log.warn(message, ...args);
    }

    error(message: string, ...args: unknown[]): void {
        log.error(message, ...args);
    }

    debug(message: string, ...args: unknown[]): void {
        log.debug(message, ...args);
    }
}
