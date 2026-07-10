// /* eslint-disable @typescript-eslint/no-explicit-any */
// import { CapaIOType } from '$libs/utils/db/schema/capatype.js';
// import { z } from 'zod';
// import { Capability } from '../capability/is.js';

// /**
//  * 内部私有辅助：将带有 Zod 实例的运行态 IO 数组脱水为纯 JSON 树
//  */
// function dehydrateIO(ioList: CapaIOType[] | undefined): any[] | undefined {
//     if (!ioList || !Array.isArray(ioList)) return ioList;
//     return ioList.map(io => {
//         if (typeof io === 'string' || !io) return io;
//         const { schema, ...rest } = io;
//         return {
//             ...rest,
//             // 如果是 Zod 实例则转为 JSON Schema，否则保持原样
//             schema: schema instanceof z.ZodType ? z.toJSONSchema(schema) : schema
//         };
//     });
// }

// /**
//  * 内部私有辅助：将纯 JSON 树中的 schema 恢复为活的 Zod 实例
//  */
// function hydrateIO(ioList: any[] | undefined): CapaIOType[] | undefined {
//     if (!ioList || !Array.isArray(ioList)) return ioList;
//     return ioList.map(io => {
//         if (typeof io === 'string' || !io) return io;
//         const { schema, ...rest } = io;
//         return {
//             ...rest,
//             // 如果是对象格式的 JSON Schema 则复活为 Zod 实例
//             schema: schema && typeof schema === 'object' ? z.fromJSONSchema(schema) : undefined
//         };
//     });
// }

// /**
//  * 核心函数：将 Drizzle 读出的 capa 数据（含 Zod 实例）安全序列化为标准 JSON 字符串
//  * @param data 支持传入单个 capa 对象或 capa 对象数组
//  * @param space JSON 缩进空格数，默认 2
//  */
// export function capaToJSON(data: Capability | Capability[], space = 2): string {
//     if (!data) return JSON.stringify(data);

//     const isArray = Array.isArray(data);
//     const list = isArray ? data : [data];

//     // 清洗并脱水 Zod 实例
//     const cleanList = list.map(item => ({
//         ...item,
//         input: dehydrateIO(item.input),
//         output: dehydrateIO(item.output)
//     }));

//     return JSON.stringify(isArray ? cleanList : cleanList[0], null, space);
// }

// /**
//  * 核心函数：将外部 JSON 字符串反序列化，并重新复活其中的 Zod 实例以供 Drizzle 或运行时直接使用
//  * @param jsonString 标准的 JSON 字符串
//  */
// export function capaFromJSON<T = Capability | Capability[]>(jsonString: string): T {
//     const rawData = JSON.parse(jsonString);
//     if (!rawData) return rawData;

//     const isArray = Array.isArray(rawData);
//     const list = isArray ? rawData : [rawData];

//     // 重新注入并水合 Zod 实例
//     const hydratedList = list.map(item => ({
//         ...item,
//         input: item.input ? hydrateIO(item.input) : item.input,
//         output: item.output ? hydrateIO(item.output) : item.output
//     }));

//     return (isArray ? hydratedList : hydratedList[0]) as T;
// }
