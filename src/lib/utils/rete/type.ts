

export type EvtCallback = (evt: MouseEvent) => void;

export interface IRetEditor {
    init(): Promise<void>;
    destroy(): void;
}