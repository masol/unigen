import type { ArrayItem } from "$types/blueprint/blackboard/array.js";
import { isPlainObject, isString } from "radashi";


export function isArrayItem(value: unknown): value is ArrayItem {
    if (isPlainObject(value) && 'id' in value && isString(value.id)) {
        if ('item' in value) {
            if (value.item === null) {
                return true;
            }
            if (!isPlainObject(value.item)) {
                return false;
            }
            return ('data' in value.item)
        }
        return true;
    }
    return false;
}

export function isCapaArray(value: unknown): value is ArrayItem[] {
    return Array.isArray(value) && value.every(isArrayItem);
}