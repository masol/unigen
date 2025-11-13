

export type NodeDataType = {
    id: string; // UUID.
    ref_id: string; // UUID. 索引的functor id.
    belong_id: string; // UUID. 所属的flow id.　此条目用于将全部相关字段一起拿出．
    width: number;
    height: number;
    extra?: {};
}

export type ConnectionDataType = {
    id: string; // UUID.
    belong_id: string; // UUID.所属的flow id.　此条目用于将全部相关字段一起拿出．
    from_id: string; // source node id.
    from_output: string; // source node socket name.
    to_id: string; // target node id.
    to_input: string; // target node socket name.
}

export type EventHandleType = (type: string, data?: Record<string, any>) => void;

export interface IRetEditor {
    readonly: boolean; // 读取和设置编辑器的只读状态．
    onEvent: EventHandleType | undefined; // 简化版，只允许设置一个evtHandle.
    init(): Promise<void>;
    reset(): void; // 缩放并居中．
    layout(animate?: boolean): Promise<void>; // 自动居中．
    newNode(param: Record<string, any>): Promise<void>;
    rmNode(id: string): Promise<boolean>;
    destroy(): void;
    nodeFromElement(el: HTMLElement): string | undefined;
}