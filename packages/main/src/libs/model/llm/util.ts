/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GenTextArgs } from "$types/ai/gentext.js";
import { z } from "zod";

/**
 * 运行时从 generateText 的配置中提取并验证 Zod Schema
 * @param options generateText 的入参对象
 * @returns 如果是 Zod Schema 则返回该实例，否则返回 null
 */
export function getZodSchema(options: GenTextArgs): z.ZodType<any, any, any> | null {
    // 1. 安全拦截：如果没有传入 output 配置，直接返回 null
    if (!options || !options.output) {
        return null;
    }

    // 1. 将 output 转为 any 绕过编译期检查，因为运行时这些属性是确实存在的
    const outputAny = options.output as any;
    const type = outputAny.type;

    // 2. 只有 'object' 和 'array' 模式可能携带 schema
    if (type === 'object' || type === 'array') {
        const rawSchema = outputAny.schema || outputAny.element;

        if (rawSchema) {
            // 3. 运行时的双重安全验证
            const isZod =
                rawSchema instanceof z.ZodType ||
                (typeof rawSchema === 'object' && '_def' in rawSchema && typeof rawSchema.safeParse === 'function');

            if (isZod) {
                return rawSchema as z.ZodType<any, any, any>;
            }
        }
    }

    return null;
}