// src/lib/components/dyn/type.ts

export interface ValueSnapshot<T = unknown> {
    value: T | undefined;
    loading: boolean;
    error: string | null;
}

export interface ChangePayload<T = unknown> {
    value: T | undefined;
    loading?: boolean;
    error?: string | null;
}

export type Unsubscribe = () => void;

/**
 * 数据传输原语层。不认识任何业务数据结构：
 *  - 普通值：按 key 读写 / 订阅
 *  - 文件资源：按 dir 读写 / 订阅
 * 列表项结构、子内容 key 拼法等业务知识全部在组件层。
 */
export interface IValueService {
    /* ── 普通值 · key 维度 ── */
    get<T = unknown>(key: string): T | undefined;
    getState<T = unknown>(key: string): ValueSnapshot<T>;
    onChange<T = unknown>(
        key: string,
        cb: (p: ChangePayload<T>) => void,
    ): Unsubscribe;
    set(key: string, value: unknown): Promise<void>;
    rm(key: string): Promise<void>;

    /* ── 文件资源 · dir 维度 ── */
    fileList(dir: string): Promise<string[]>;
    fileAdd(dir: string, paths: string[]): Promise<string[]>;
    fileRemove(dir: string, paths: string[]): Promise<void>;
    onFileChange(
        dir: string,
        cb: (p: ChangePayload<string[]>) => void,
    ): Unsubscribe;

    /* ── 外部变更入口（main 通过它推送；由宿主调用，非组件） ── */
    onKvChanged(key: string, value: unknown): void;

    // type.ts: interface ValueService 增
    fetch<T = unknown>(key: string): Promise<T | undefined>;

    readonly isLoading: boolean;
    readonly error: string | null;
}