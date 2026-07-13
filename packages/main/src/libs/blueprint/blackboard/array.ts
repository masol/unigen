import type { ArrayItem } from "$types/blueprint/blackboard/array.js";
import { isPlainObject, isString } from "radashi";
import * as validator from 'validator';

/**
 * 标注数据假定,如果不指定任意的schema。默认的数据布局如下：
 * 1. 如果是数组，则使用下方guard判定。兼容flatten。
 * 标准的flattern
 * @param value 
 * @returns 
 */

export function isArrayItem(value: unknown): value is ArrayItem {
    if (isPlainObject(value) && 'id' in value && isString(value.id) && validator.isUUID(value.id)) {
        return true;
    }
    return false;
}

export function isCapaArray(value: unknown): value is ArrayItem[] {
    return Array.isArray(value) && value.every(isArrayItem);
}