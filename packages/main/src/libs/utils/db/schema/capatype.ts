import { customType } from 'drizzle-orm/sqlite-core';
import Logger from 'electron-log/main.js';
import { z } from 'zod';

/**
 * 1. 使用 Zod 定义 FewShotExample 的结构
 */
export const FewShotExampleSchema = z.object({
    scenario: z.string().optional(),
    input: z.array(z.string()),
    thoughtProcess: z.string().optional(),
    output: z.array(z.string()),
    kind: z.enum(["pass", "fail"]).optional(),
});

export type FewShotExample = z.infer<typeof FewShotExampleSchema>;

// 控制数据在 KV 中的更新模式
export const ReducerStrategySchema = z.enum([
    'replace', // 覆盖：直接用新值替换旧值（例如修改状态：status: 'running' -> 'success'）
    'merge',   // 合并：对 JSON 对象进行 Shallow/Deep Merge（例如更新配置参数）这是默认值。
    'append',  // 后补：向数组末尾追加元素（例如：添加一条新的 Agent 聊天记录）
    'prepend'  // 前插：向数组开头插入元素（例如：置顶某些高优先级的待办任务）
]);
// 控制空间拓扑（数据在 KV 中到底怎么存）-- 只针对数组。
export const storageModeSchema = z.enum([
    'flatten',  // 扁平模式：拆分为多个小 Key，如 key_{{id}} 散落存储
    'monolith', // 单体模式：所有属性作为子字段，嵌套存储在唯一的一个大 Key 下
    // //@TODO: chain模式,在需要immutable的状态存储和回溯查询时支持。
    // 'chained'   // 链式模式：每次状态变更扩展一个新的 key_{{id}}_{{version}}，通过指针串联    
]);

export type CapaIOType = {
    /** 意图变量，承载意图路由（Intent Routing）时，路由（Route）并映射到 KV Store 中的fieldKey(mustache格式) */
    intent: string;
    /** 归一化对齐变量名，驼峰/下划线，全局唯一，消歧核心标识 */
    fieldKey?: string;
    schema?: z.ZodTypeAny; // 可选的 Zod schema，用于验证数据的结构和类型
    reducer?: z.infer<typeof ReducerStrategySchema>; // 可选的 reducer 策略，用于处理数据的合并或替换逻辑
    storage?: z.infer<typeof storageModeSchema>; // 可选的存储模式，用于控制数据在 KV 中的存储方式,如果本值存在，数据一定是数组类型。默认是monolith。
}

/**
 * 用 Zod v4+ 原生 JSON Schema 双向转换实现的 SQLite 自定义类型
 */
export const capaIOJsonType = customType<{
    data: CapaIOType[];       // 顶层 TypeScript 运行时类型（含活的 Zod 校验器）
    driverData: string;       // SQLite 物理存储文本（标准的 JSON 字符串）
}>({
    // 显式声明底层在 SQLite 中的数据类型
    dataType() {
        return 'text';
    },

    // 1. 动态编码：当调用 db.insert/update 时自动触发（运行态 -> 存储态）
    toDriver(value: CapaIOType[]): string {
        const persistedData = value.map(io => {
            if (typeof io === 'string') return io;
            // 💡 使用解构赋值分离 schema，其余字段通过 ...rest 自动收集
            const { schema, ...rest } = io;
            return {
                ...rest,
                // 使用官方原生的 z.toJSONSchema() 转换为标准 JSON 对象
                schema: schema ? z.toJSONSchema(schema) : undefined
            };
        });
        return JSON.stringify(persistedData);
    },

    // 2. 动态解码：当调用 db.select 从数据库捞数据时自动触发（存储态 -> 运行态）
    fromDriver(value: string): CapaIOType[] {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rawList = JSON.parse(value) as any[];
            return rawList.map(io => {
                if (typeof io === 'string') return io;
                // 💡 同样使用解构赋值分离 schema，自动展开其余所有解出来的字段
                const { schema, ...rest } = io;
                return {
                    ...rest,
                    // 使用官方原生的 z.fromJSONSchema() 动态复活回 Zod 实例
                    schema: schema ? z.fromJSONSchema(schema) : undefined
                };
            });
        } catch {
            Logger.error('Failed to parse capaIOJsonType from database:', value);
            return []; // 容错处理
        }
    }
});