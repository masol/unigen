import { ICapaFunctor } from "$libs/blueprint/capability/type.js";
import type { IProjectContext } from "$libs/project/type.js";
import type { ChatStreamEvent } from "$types/shared/chat.js";
import { ResolvedSettings } from "./settings.js";


export interface CommandInfo {
    isCommand: boolean;
    command?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args?: Record<string, any>;
    body: string;
}

export type CmdMode = 'cmd' | 'rerun' | null;

export interface IRunnerContext {
    /** 原生的 Web API AbortSignal，可透传给支持取消的异步底层操作 */
    readonly signal: AbortSignal;
    // 默认的调用序列，用来指示本次runcontext的标识--这个标识只在进程内唯一(用户指定正向增加，内部分配负向减少)
    readonly seq: number;

    // 指示本次会话的id.
    readonly sessId: string;
    /**
     * 为执行者准备的任务级存储--只在本次任务中有效。
     * 已使用的变量名:
     * timestamp : 用户调用时传入的timestamp,属于用户消息的timestamp--user messsage在客户端创建.
     */
    readonly store: Record<string, unknown>;
    readonly msgId: string; // 此变量是否移入store?
    readonly files: string[]; // 此变量是否移入store?
    readonly mode: CmdMode; // 此变量是否移入store?
    readonly timestamp: number; // 客户端消息的创建时间，此变量是否移入store?
    readonly settings: Partial<ResolvedSettings>;
    readonly skills: string[];
    readonly tools: string[];

    /** 快照检查点：判断当前工作流是否已经被终止 */
    readonly isAborted: boolean;

    readonly prj: IProjectContext;
    cmd: CommandInfo;

    /**
     * 内部或外部触发取消的方法（配合宿主环境使用）
     */
    triggerAbort(): void;

    // 为mode打的补丁，为了支持rerun。如果加载到cmd,需要重置mode.
    setMode(mode: CmdMode): void;

    getVar(name: string): unknown | null;
    setVar(name: string, value: unknown): void;

    /**
     * 加载特定能力id对应的执行对象。
     * @param capaId capability id.
     */
    loadFunctor(capaId: string): ICapaFunctor | null


    // ==========================================
    // 📝 汇报进口，通知渲染进程工作进度。
    // ==========================================
    /**
     * @deprecated
     * 向渲染端主界面发送通知，以报告关键进度和细节--只显示一个，不会树状显示。
     * @param message 
     * @param args 
     */
    notify(title: string, detail: string): void

    /**
     * 对话界面是一等公民，使用此接口来汇报。
     * @param evt 
     */
    report(evt: ChatStreamEvent): void

    // ==========================================
    // 📝 日志接口 (适配 electron-log)
    // ==========================================

    /**
     * 打印普通信息日志
     * @param message 日志文本
     * @param args 类似 console.log 的后续动态参数
     */
    info(message: string, ...args: unknown[]): void;

    /**
     * 打印警告日志
     */
    warn(message: string, ...args: unknown[]): void;

    /**
     * 打印错误日志
     */
    error(message: string, ...args: unknown[]): void;

    /**
     * 打印调试日志
     */
    debug(message: string, ...args: unknown[]): void;
}
