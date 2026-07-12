// src/lib/store/ui/activity/type.ts

export type Unsubscribe = () => void;

/** 值监听：直接收原值（可能为 undefined），无任何包裹。 */
export type ValueListener<T = unknown> = (value: T | undefined) => void;

/** 文件列表监听：直接收最新路径数组。 */
export type FilesListener = (value: string[]) => void;

/**
 * 纯数据传输服务：只提供稳定的「读 / 写 / 删 / 监听」，绝不缓冲、不持有快照。
 *  - get 永远向 main 读最新值。
 *  - set/rm 成功后把新值派发给「订阅了该 key 的监听者」。
 *  - main 静默变更经 onKvChanged 派发。
 *  - 是否需要缓冲/监听，由组件侧 hook 自行决定（唯一变更源可以不监听）。
 */
export interface IValueService {
    /* 普通值：key 维度 */
    get<T = unknown>(key: string): Promise<T | undefined>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    rm(key: string): Promise<void>;
    /** 订阅 key 的一切变更（main 静默变更 + 其它组件的 set/rm 回流）。 */
    subscribe<T = unknown>(key: string, cb: ValueListener<T>): Unsubscribe;

    /* 文件资源：dir 维度 */
    fileList(dir: string): Promise<string[]>;
    fileAdd(dir: string, paths: string[]): Promise<string[]>;
    fileRemove(dir: string, paths: string[]): Promise<void>;
    subscribeFiles(dir: string, cb: FilesListener): Unsubscribe;

    /** 宿主推入：main 侧某 key 变更 */
    onKvChanged(key: string, value: unknown): void;
}