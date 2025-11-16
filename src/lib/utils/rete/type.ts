import type { UniNode } from "./llmNode";


export type NodeDataType = {
    id: string; // UUID.
    ref_id: string; // UUID. 索引的functor id.
    belong_id: string; // UUID. 所属的flow id.此条目用于将全部相关字段一起拿出．
    width: number;
    height: number;
    extra?: Record<string,unknown>;
}

export type ConnectionDataType = {
    id: string; // UUID.
    belong_id: string; // UUID.所属的flow id.此条目用于将全部相关字段一起拿出．
    from_id: string; // source node id.
    from_output: string; // source node socket name.
    to_id: string; // target node id.
    to_input: string; // target node socket name.
}

export type EventHandleType = (type: string, data?: unknown) => void;

export interface IRetEditor {
    readonly: boolean; // 读取和设置编辑器的只读状态．
    onEvent: EventHandleType | undefined; // 简化版，只允许设置一个evtHandle.
    init(): Promise<void>; // 传入所属id.自行从数据库中加载．
    reset(): void; // 缩放并居中．
    layout(animate?: boolean): Promise<void>; // 自动居中．
    newNode(param: Record<string, unknown>): Promise<void>;
    rmNode(id: string): Promise<boolean>;
    destroy(): void;
    node4fuctor(fid: string): UniNode[];
    getNode(id:string): UniNode | undefined;
    updNode(id: string, param: Record<string, unknown>):Promise<void>;
    nodeFromElement(el: HTMLElement): string | undefined;
}