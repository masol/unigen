import type { PartialNode, Connection as SqlConnection } from "../appdb/rete.type";
import type { UniNode } from "./llmNode";


export type NodeDataType = {
    id: string; // UUID.
    ref_id: string; // UUID. 索引的functor id.
    belong_id: string; // UUID. 所属的flow id.此条目用于将全部相关字段一起拿出．
    width: number;
    height: number;
    extra?: Record<string, unknown>;
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

export type NodePosition = {
    x: number;
    y: number;
}

export type TraveContext = {
    node: UniNode,
    position?: NodePosition,
    param?: unknown,
}

export type TraversalOption = {
    order?: string; // 有效值: any / exec / 
    param?: unknown; // 用户提供的参数，将放入回调的TraveContext.
    positon?: boolean; // 是否包含位置信息．
    concurrency?: number; // 并行数量．
}

// 可以安全抛出异常来打断便利．
export type TraveFunc = (ctx: TraveContext) => Promise<void>;
export type onConnRm = (id: string) => Promise<void>;
export interface IRetEditor {
    readonly: boolean; // 读取和设置编辑器的只读状态．
    readonly belongtoId: string; // 读取rete所属的流程图Id.
    onEvent: EventHandleType | undefined; // 简化版，只允许设置一个evtHandle.
    init(): Promise<void>; // 传入所属id.自行从数据库中加载．
    reset(): Promise<void>; // 缩放并居中．
    layout(animate?: boolean): Promise<void>; // 自动居中．
    newNode(param: Record<string, unknown>): Promise<void>;
    addConnection(conn: SqlConnection): Promise<boolean>;
    rmNode(id: string,func: onConnRm): Promise<boolean>;
    destroy(): void;
    traversal(func: TraveFunc, opt?: TraversalOption): Promise<void>;
    getFuncNodes(fid: string): UniNode[];
    getNode(id: string): UniNode | undefined;
    getSqlNode(id: string): PartialNode | undefined;
    updNode(id: string, param: Record<string, unknown>): Promise<void>;
    nodeFromElement(el: HTMLElement): string | undefined;
}