import type { ICapaFunctor } from "$libs/blueprint/capability/type.js";

// type.ts
export interface IProjectContext {
    readonly path: string;
    readonly type: string;
    readonly wid: number;
    readonly agent: ICapaFunctor | null;  // 本地Agent,在任务打开或新建时创建，可以随时刷新。
    reloadAgent(): Promise<void>;  // 重新加载本地Agent.
    getCmd(cmdName: string): ICapaFunctor | null;
    reloadCmd(cmdName?: string): Promise<void>; // 重新加载本地cmd--如果未指定名称，加载全部。
    getPath(partName: string | string[], root?: boolean): string;
    notify(evtName: string, payload: unknown, srcId?: number): boolean;
    register<T extends IProjectController>(token: ServiceToken<T>): void;
    getService<T extends IProjectController>(token: ServiceToken<T>): T | null;
}

export interface IProjectController {
    init?(): void | Promise<void>;
    dispose?(): void | Promise<void>;
}

/** 携带稳定 symbol 的构造函数类型 */
export interface ServiceToken<T extends IProjectController = IProjectController> {
    readonly serviceKey: symbol;
    new(context: IProjectContext): T;
}

export type ControllerConstructor<T extends IProjectController = IProjectController> =
    new (context: IProjectContext) => T;

export interface EmbedKVStore {
    get<T>(key: string): T | undefined | null;
    set(key: string, value: unknown): void;
}

export const metaDirName = 'meta';