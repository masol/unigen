/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PrjTimeStore } from "$types/prjstore.js";
import dayjs, { Dayjs } from "dayjs";
import { isPlainObject } from "radashi";


export function isPrjtimeStore<T>(value: unknown): value is PrjTimeStore<T> {
    return isPlainObject(value) && "value" in value && "updatedAt" in value;
}

/**
 * 工具函数：直接获取值（递归解包，包括数组成员）
 */
export function unwrapPrjTime<T>(value: T | PrjTimeStore<T>): T {
    if (!isPrjtimeStore(value)) {
        return value;
    }

    const unwrapped = value.value;

    // 如果解包后是数组，递归处理数组成员
    if (Array.isArray(unwrapped)) {
        return unwrapped.map(item => {
            if (item && 'item' in item && isPrjtimeStore((item as any).item)) {
                return {
                    ...item,
                    item: (item as any).item.value
                };
            }
            return item;
        }) as T;
    }

    return unwrapped;
}

/**
 * PrjTimeStore 视图，专注于时间判断和递归访问
 * 只处理单个 PrjTimeStore，保持单一数据源
 */
export class PrjTimeView<T = any> {
    private readonly raw: PrjTimeStore<T>;
    // 假设：数组成员要么全是 PrjTimeStore，要么全不是，初始化后不会变
    private readonly _itemsArePrjTimeStore: boolean;

    private constructor(value: PrjTimeStore<T>) {
        this.raw = value;

        // 检查数组成员是否是 PrjTimeStore
        this._itemsArePrjTimeStore = this.checkItemsArePrjTimeStore();
    }

    /**
     * 检查数组成员是否为 PrjTimeStore
     */
    private checkItemsArePrjTimeStore(): boolean {
        if (!Array.isArray(this.raw.value) || this.raw.value.length === 0) {
            return false;
        }

        // 检查第一个非 null 元素
        const firstItem = this.raw.value.find(item => item != null);
        if (!firstItem) {
            return false;
        }

        return 'item' in firstItem && isPrjtimeStore((firstItem as any).item);
    }

    /**
     * 创建视图，如果不是 PrjTimeStore 则返回 null
     */
    static create<T>(value: unknown): PrjTimeView<T> | null {
        if (!isPrjtimeStore<T>(value)) {
            return null;
        }
        return new PrjTimeView(value);
    }

    /** 获取外层的更新时间 */
    get updatedAt(): Dayjs | null {
        return this.raw.updatedAt ? dayjs(this.raw.updatedAt) : null;
    }

    /** 获取原始值（已解包） */
    get value(): T {
        return this.raw.value;
    }

    /** 是否是数组 */
    get isArray(): boolean {
        return Array.isArray(this.raw.value);
    }

    /** 数组长度（如果是数组） */
    get length(): number {
        return Array.isArray(this.raw.value) ? this.raw.value.length : 0;
    }

    /** 数组成员是否是 PrjTimeStore */
    get itemsArePrjTimeStore(): boolean {
        return this._itemsArePrjTimeStore;
    }

    /**
     * 私有方法：根据 bLatest 标志返回最新或最早时间
     */
    private getPrjTime(bLatest: boolean): Dayjs | null {
        let targetTime = bLatest ? dayjs(0) : dayjs().add(10, 'year');
        let bChanged = false;

        const compareAndUpdate = (timeStr: string | null | undefined) => {
            if (!timeStr) return;
            const current = dayjs(timeStr);
            const shouldUpdate = bLatest ? current.isAfter(targetTime) : current.isBefore(targetTime);
            if (shouldUpdate) {
                targetTime = current;
                bChanged = true;
            }
        };

        // 外层时间
        compareAndUpdate(this.raw.updatedAt);

        // 如果是数组且成员是 PrjTimeStore，递归处理子项
        if (this._itemsArePrjTimeStore && Array.isArray(this.raw.value)) {
            this.raw.value.forEach((item: any) => {
                if (item && 'item' in item && isPrjtimeStore(item.item)) {
                    compareAndUpdate(item.item.updatedAt);
                }
            });
        }

        return bChanged ? targetTime : null;
    }

    /**
     * 获取最新时间（递归包括子项）
     */
    getLatestTime(): Dayjs | null {
        return this.getPrjTime(true);
    }

    /**
     * 获取最早时间（递归包括子项）
     */
    getEarliestTime(): Dayjs | null {
        return this.getPrjTime(false);
    }

    /**
     * 获取所有时间戳（包括递归子项）
     */
    getAllTimes(): Dayjs[] {
        const times: Dayjs[] = [];

        if (this.raw.updatedAt) {
            times.push(dayjs(this.raw.updatedAt));
        }

        // 如果是数组且成员是 PrjTimeStore，递归收集子项时间
        if (this._itemsArePrjTimeStore && Array.isArray(this.raw.value)) {
            this.raw.value.forEach((item: any) => {
                if (item && 'item' in item && isPrjtimeStore(item.item)) {
                    const itemTime = item.item.updatedAt;
                    if (itemTime) {
                        times.push(dayjs(itemTime));
                    }
                }
            });
        }

        return times;
    }

    /**
     * 获取剥离后的值（非侵入式）- 复用 unwrapPrjTime
     */
    stripValue(): T {
        return unwrapPrjTime(this.raw);
    }

    // ===== 数组访问方法 =====

    /** 获取第 n 个元素（如果是数组） */
    at(index: number): T extends Array<infer U> ? U | undefined : undefined {
        if (!Array.isArray(this.raw.value)) {
            return undefined as any;
        }
        return this.raw.value.at(index) as any;
    }

    /** 获取指定索引的元素（如果是数组） */
    get(index: number): T extends Array<infer U> ? U | undefined : undefined {
        if (!Array.isArray(this.raw.value)) {
            return undefined as any;
        }
        return this.raw.value[index] as any;
    }

    /**
     * 获取第 n 个元素的更新时间
     * - 如果成员是 PrjTimeStore，返回成员的 updatedAt
     * - 如果成员不是 PrjTimeStore，返回自身的 updatedAt
     * - 如果都没有，返回 null
     */
    getItemUpdatedAt(index: number): Dayjs | null {
        if (!Array.isArray(this.raw.value)) {
            return null;
        }

        const item = this.raw.value[index];
        if (item == null) {
            return null;
        }

        // 如果成员是 PrjTimeStore，返回成员的时间
        if (this._itemsArePrjTimeStore && 'item' in item && isPrjtimeStore((item as any).item)) {
            const updatedAt = (item as any).item.updatedAt;
            return updatedAt ? dayjs(updatedAt) : null;
        }

        // 否则返回自身的时间
        return this.updatedAt;
    }
}

/**
 * 工具函数：创建视图
 */
export function viewPrjTime<T>(value: unknown): PrjTimeView<T> | null {
    return PrjTimeView.create<T>(value);
}


/**
 * 工具函数：从单个 PrjTimeStore 获取时间（快捷函数）
 * 获取最新或最早时间（递归包括子项）
 */
export function getPrjTime<T>(
    value: PrjTimeStore<T> | null,
    bLatest: boolean
): Dayjs | null {
    if (!value) return null;

    const view = PrjTimeView.create(value);
    if (!view) return null;

    return bLatest ? view.getLatestTime() : view.getEarliestTime();
}

/**
 * 工具函数：处理数组的情况
 * 获取数组中所有元素的最新/最早时间
 */
export function getPrjTimeFromArray<T>(
    values: Array<PrjTimeStore<T> | null> | null,
    bLatest: boolean
): Dayjs | null {
    if (!values || values.length === 0) return null;

    let targetTime = bLatest ? dayjs(0) : dayjs().add(10, 'year');
    let bChanged = false;

    values.forEach(value => {
        if (!value) return;

        const view = PrjTimeView.create(value);
        if (!view) return;

        const time = bLatest ? view.getLatestTime() : view.getEarliestTime();

        if (time) {
            const shouldUpdate = bLatest ? time.isAfter(targetTime) : time.isBefore(targetTime);
            if (shouldUpdate) {
                targetTime = time;
                bChanged = true;
            }
        }
    });

    return bChanged ? targetTime : null;
}

/**
 * 工具函数：剥离数组中所有元素的时间信息（非侵入式）
 */
export function stripPrjTimeArray<T>(
    values: Array<PrjTimeStore<T> | null> | null
): Array<T | null> {
    if (!values) {
        return [];
    }

    return values.map(v => v ? unwrapPrjTime(v) : null);
}