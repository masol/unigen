import { isString } from 'radash';
import { throwPrecondition } from './err.js';

/**
 * 确保输入值转换为字符串
 */
export function toStringSafe(val: string | string[] | unknown): string {
    // 1. 使用 radash 的 isString 进行严谨判断
    if (isString(val)) {
        return val;
    }

    // 2. 判断是否为字符串数组（内部成员也必须是字符串）
    if (Array.isArray(val) && val.every(item => isString(item))) {
        return val.join('\n');
    }

    // 3. 不满足条件，抛出前置条件错误
    return throwPrecondition(`无法合法转化为字符串:${JSON.stringify(val, null, 2)}`, true);
}

/**
 * 确保输入值转换为字符串数组
 */
export function toArraySafe(val: string | string[] | unknown): string[] {
    // 1. 优先判断字符串数组
    if (Array.isArray(val) && val.every(item => isString(item))) {
        return val;
    }

    // 2. 判断单个字符串
    if (isString(val)) {
        return [val];
    }

    // 3. 不满足条件，抛出前置条件错误
    return throwPrecondition(`无法合法转化为字符串数组:${JSON.stringify(val, null, 2)}`, true);
}