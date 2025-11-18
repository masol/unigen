export interface PortConfig {
    key: string;
    label?: string;
    type?: string;
    id: string;
}

export interface Node {
    id: string;
    ref_id: string;
    ref_type: string; // 默认值 "functor"
    belong_id: string;
    label?: string;  // 为了简化初始化的依赖解藕，这里缓冲ref_id所属word的label.
    x: number;
    y: number;
    cached_input?: PortConfig[]; // 可空
    cached_output?: PortConfig[]; // 可空
    extra?: { [key: string]: unknown }; // 改为对象类型
    created_at: number;
    updated_at: number;
}

export interface Connection {
    id: string;
    belong_id: string;
    from_id: string;
    from_output: string;
    to_id: string;
    to_input: string;
    extra?: { [key: string]: unknown }; // 改为对象类型
    created_at: number;
    updated_at: number;
}

export type PartialNode = Partial<Omit<Node, 'id'>> & { id: string };
export type PartialConnection = Partial<Omit<Connection, 'id'>> & { id: string };

export interface ReteData {
    nodes: Node[];
    connections: Connection[];
}