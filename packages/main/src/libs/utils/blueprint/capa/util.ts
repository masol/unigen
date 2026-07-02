/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CapaIOType } from "$libs/utils/db/schema/capatype.js";
import { type PrjTimeStore, isPrjtimeStore } from "$types/prjstore.js";
import dayjs, { Dayjs } from "dayjs";


/**
 * 从一个具体的io对象中获取其对应的fieldKey，如果无法确定，返回空字符串。注意: 根据intent来获取fieldKey的处理过程--被称为基于Blackboard的意图路由（Intent Routing）-- (将kv表当作词汇表，做重排计算)，属于另外一个LLM介入的异步模块。需要在调用本函数前执行以确保fieldKey已经被正确计算出来。否则返回空字符串。

  注意：返回的fieldKey是一个mustache模板，需要实例化后才能使用--除非字符串中无变量(无数组)。
//*/
export function getFieldkey(io: CapaIOType, subId?: string): string | null {
    if (io.fieldKey) {
        return subId ? `${io.fieldKey}_${subId}` : io.fieldKey;
    }
    return null
}



//递归将value转化为普通对象--剥离updatedAt信息。
export function stripPrjTime<T>(value: Array<PrjTimeStore<T> | null> | null): Array<T | null> {
    if (!value) {
        return [];
    }

    const ret: Array<T | null> = [];

    value.forEach((v) => {
        if (v) {
            if (Array.isArray(v.value)) { // 属于数组。
                v.value.forEach(v => {
                    if ('item' in v) {
                        if (isPrjtimeStore(v.item)) {
                            v.item = v.item.value;
                        }
                    }
                })
            }
            ret.push(v.value);
        } else {
            ret.push(v);
        }
    })

    return ret;
}




/**
 * 获取时间戳：根据 bLatest 标志返回最新或最早时间
 */
export function getPrjTime(values: Array<PrjTimeStore<any> | null> | PrjTimeStore<any> | null, bLatest: boolean): Dayjs | null {
    // 统一处理为数组
    const valuesArray = Array.isArray(values) ? values : (values ? [values] : []);

    // 1. 如果数组为空或没有有效数据，直接返回 null
    if (!valuesArray || valuesArray.length === 0) return null;

    let targetTime = bLatest ? dayjs(0) : dayjs().add(10, 'minute');
    let bChanged = false;

    // 2. 核心对比逻辑（保持闭包特性，支持接收 null/undefined）
    const compareAndUpdate = (timeStr: string | Date | number | undefined | null) => {
        if (!timeStr) return;
        const current = dayjs(timeStr);
        const shouldUpdate = bLatest ? current.isAfter(targetTime) : current.isBefore(targetTime);
        if (shouldUpdate) {
            targetTime = current;
            bChanged = true;
        }
    };

    // 3. 遍历外部传入的 values 数组
    valuesArray.forEach(value => {
        if (!value) return; // 过滤掉 null 的项

        // 3.1 无论是不是数组，外层的 updatedAt 都要参与对比
        compareAndUpdate(value.updatedAt);

        // 3.2 如果内部的 value 是数组，则深层遍历对比子项
        if (Array.isArray(value.value)) {
            value.value.forEach((v: any) => {
                if (v && isPrjtimeStore(v.item)) {
                    compareAndUpdate(v.item.updatedAt);
                }
            });
        }
    });

    // 4. 统一返回
    return bChanged ? targetTime : null;
}
