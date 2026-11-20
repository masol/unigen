// combobox.types.ts
// 组合框公共类型 + 首次提示标记。

export interface ComboboxItem {
    id: string;
    label: string;
    description?: string;
    /** 分组标题；为空字符串/undefined 时归入无标题组 */
    group?: string;
}

/** 分组化并附扁平索引后供列表渲染的数据结构 */
export interface ComboboxGroup {
    heading: string;
    items: { item: ComboboxItem; index: number }[];
}

const HINT_STORAGE_KEY = "unigen.combobox-hint-seen";

/**
 * 是否已经看过键盘速查提示。
 * SSR 阶段返回 true（视为"见过"，避免服务端/客户端首帧不一致的闪烁）；
 * 客户端 localStorage 缺失时返回 false，从而展示一次。
 */
export function hasSeenComboboxHint(): boolean {
    if (typeof window === "undefined") return true;
    try {
        return window.localStorage.getItem(HINT_STORAGE_KEY) === "1";
    } catch {
        return true;
    }
}

export function markComboboxHintSeen(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(HINT_STORAGE_KEY, "1");
    } catch {
        /* 忽略存储异常（隐私模式 / 配额满） */
    }
}