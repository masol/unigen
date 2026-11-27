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

export function truncate(str: string, maxLength = 30, ellipsis = '...') {
    if (str.length <= maxLength) {
        return str;
    }
    return str.slice(0, maxLength) + ellipsis;
}



/**
 * 转义 Markdown 表格单元格内容。
 *
 * 顺序不可调换：必须先转义反斜杠本身。否则输入 `\|` 时，`|` 被转义成 `\|`，
 * 与其前面的 `\` 拼成 `\\|` —— `\\` 会被解析成一个字面反斜杠，竖线重新裸露，
 * 表格行被拆开（CodeQL js/incomplete-sanitization / CWE-116）。
 * 换行（含孤立 \r）统一折叠为空格，避免把一行拆成多行、撑坏表格结构。
 */
export function escapeTableCell(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\|/g, "\\|")
        .replace(/\r\n|\r|\n/g, " ");
}
