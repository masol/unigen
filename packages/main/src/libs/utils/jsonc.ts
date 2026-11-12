import stripJsonComments from 'strip-json-comments';

/**
 * JSONC 解析结果类型（安全模式）
 */
export type SafeParseResult<T = unknown> =

    | { success: true; data: T }
    | { success: false; error: SyntaxError };

/**
 * 内部核心解析逻辑
 * strip-json-comments 默认用空白替换注释，保留原始行列位置，
 * 使 JSON.parse 报错时的行号与源文件一致。
 */
function parseJsoncCore(text: string): unknown {
    const stripped = stripJsonComments(text);
    return JSON.parse(stripped);
}

/**
 * 严格解析 JSONC 字符串
 * - 支持 // 和 /* *\/ 注释
 * - 不支持尾随逗号（JSONC 规范本身不包含尾随逗号）
 * - 解析失败时直接抛出 SyntaxError
 *
 * @param text - JSONC 格式字符串
 * @returns 解析后的对象
 */
export function parseJsonc<T = unknown>(text: string): T {
    return parseJsoncCore(text) as T;
}

/**
 * 安全解析 JSONC 字符串（不抛异常）
 * - 遵循 Zod/Valibot safeParse 命名约定
 * - 返回判别联合类型，方便类型收窄
 *
 * @param text - JSONC 格式字符串
 * @returns 成功或失败的判别结果
 */
export function safeParseJsonc<T = unknown>(text: string): SafeParseResult<T> {
    try {
        const data = parseJsoncCore(text) as T;
        return { success: true, data };
    } catch (err) {
        return {
            success: false,
            error: err instanceof SyntaxError ? err : new SyntaxError(String(err)),
        };
    }
}


