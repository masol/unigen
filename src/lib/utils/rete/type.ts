

export type EvtCallback = (evt: MouseEvent) => void;

export interface IRetEditor {
    readonly: boolean; // 读取和设置编辑器的只读状态．
    init(): Promise<void>;
    reset(): void; // 缩放并居中．
    layout(animate?: boolean): Promise<void>; // 自动居中．
    newNode(param: Record<string, any>): Promise<void>;
    destroy(): void;
}