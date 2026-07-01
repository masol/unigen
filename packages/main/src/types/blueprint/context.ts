import type { IProjectContext } from "$libs/project/type.js";
import { ICapaFunctor } from "$libs/utils/blueprint/functor/type.js";

export interface IRunnerContext {
    /** 原生的 Web API AbortSignal，可透传给支持取消的异步底层操作 */
    readonly signal: AbortSignal;

    /** 快照检查点：判断当前工作流是否已经被终止 */
    readonly isAborted: boolean;

    /** 快照检查点：判断是否属于“强制杀死”状态 */
    readonly isForceKilled: boolean;
    readonly prj: IProjectContext;

    // ==========================================
    // 💾 全局变量存储接口 (同步持久化 KV)
    // ==========================================

    /**
     * 设置全局变量，同步写入数据库
     * @param key 键名
     * @param value 任意可序列化的值
     */
    set(key: string, value: unknown): void;

    /**
     * 获取全局变量，同步从数据库读取
     * @param key 键名
     * @returns 泛型 T 或 null
     */
    get<T>(key: string): T | null;

    /**
     * 删除指定的全局变量，同步从数据库移除
     * @param key 键名
     */
    remove(key: string): void;

    /**
     * 内部或外部触发取消的方法（配合宿主环境使用）
     * @param force 是否属于强制杀死
     */
    triggerAbort(force?: boolean): void;


    /**
     * 加载特定能力id对应的执行对象。
     * @param capaId capability id.
     */
    loadFunctor(capaId: string): ICapaFunctor | null


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
