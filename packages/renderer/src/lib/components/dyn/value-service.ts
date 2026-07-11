// src/lib/components/dyn/value-service.ts

/**
 * 值服务：节点通过它读/写数据，不关心背后是 IPC / DB / 内存。
 * 纯命令式，不是响应式 store。节点内部自行做有效性检查。
 */
export interface ValueService {
    /** 读值；无效/不存在返回 undefined */
    get<T = unknown>(key: string): T | undefined;
    /** 写值；异步（可能落 DB / 走 IPC） */
    set(key: string, value: unknown): Promise<void>;

    /** 列表类操作（增删改）；返回更新后的最新值可选 */
    listAppend(key: string, value: unknown): Promise<void>;
    listUpdate(key: string, itemId: string, value: unknown): Promise<void>;
    listRemove(key: string, itemId: string): Promise<void>;

    /** 单条内容按 itemId 读取（编辑列表项时取原文） */
    getItemContent(key: string, itemId: string): Promise<string>;

    /** 全局忙碌 / 错误（供节点显示 loading、error 条） */
    readonly isLoading: boolean;
    readonly error: string | null;
}

/* ── 安全读取工具 ── */

export function readString(svc: ValueService, key: string): string {
    const v = svc.get(key);
    return typeof v === "string" ? v : "";
}

export function readStringOr(
    svc: ValueService,
    key: string,
    fallback: string,
): string {
    const v = svc.get(key);
    return typeof v === "string" && v.length > 0 ? v : fallback;
}

export function readList<T = unknown>(svc: ValueService, key: string): T[] {
    const v = svc.get(key);
    return Array.isArray(v) ? (v as T[]) : [];
}

/** 写 key：binding.writeKey 优先，否则用 readKey */
export function writeKeyOf(binding: {
    readKey: string;
    writeKey?: string;
}): string {
    return binding.writeKey ?? binding.readKey;
}