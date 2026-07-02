
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { CapaIOType } from "$libs/utils/db/schema/capatype.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { PrjTimeStore } from "$types/prjstore.js";
// import Logger from "electron-log/main.js";
import { isPlainObject, isString } from "radashi";
import { getFieldkey } from "./util.js";

function loadIO<T>(prjDB: PrjDB, io: CapaIOType, subId?: string): PrjTimeStore<T> | null {
    const key = getFieldkey(io, subId);
    if (key) {
        return prjDB.getWithTime<T>(key);
    }
    return null;
}


/**
 * 获取单个 IO 数据并进行 schema 校验与 flatten 展开
// 注意：这里返回的不是CapaIOType.schema指定的类型，而是附加了更新时间信息的对象。
// 一般不需要直接调用这个，而是通过getIOInfo来获取原始对象，包括是否有更新的
// 或者调用getExpiredChunk(input,output)来获取1对1关系的失效块。
 * @param ctx 
 * @param i 
 * @returns 
 */
export function getIOData<T = unknown>(ctx: IRunnerContext, i: CapaIOType): PrjTimeStore<T> | null {
    const prjDB: PrjDB = PrjDB.ensure(ctx.prj);
    const ioData = loadIO<T>(prjDB, i);

    if (i.schema && ioData && ioData.value) {
        // console.log("ioData.value=", ioData.value)
        // console.log("i.schema=", i.schema)

        const parseResult = i.schema.safeParse(ioData.value);
        if (!parseResult.success) {
            ctx.error(`Failed to parse IOdata for ${getFieldkey(i)}. Error: ${parseResult.error}`);
            return null;
        }
    }

    // flatten只针对数组展开。monolith(默认值)会跳过此处--将整个数组当作单值对待。
    if (Array.isArray(ioData?.value) && i.storage === "flatten") {
        // if (i.storage && i.storage !== "flatten") {
        //     throwNotimplement(`${i.storage}存储模式的数组尚未被支持。`);
        // }

        ioData.value.forEach((v) => {
            const value: Record<string, unknown> | null = isPlainObject(v) ? v as Record<string, unknown> : null;
            if (value?.id && isString(value.id)) { // 如果id有值。
                value.item = loadIO<T>(prjDB, i, value.id); // 读取散落的item数据。
            }
        });
    }

    return ioData;
}

/**
 * 批量获取 IO 数据
 */
export function getAllIOData<T = unknown>(ctx: IRunnerContext, io: CapaIOType[]): Array<PrjTimeStore<T> | null> | null {
    const retio: Array<PrjTimeStore<T> | null> = [];

    io.forEach((i) => {
        const ioData = getIOData<T>(ctx, i);
        retio.push(ioData);
    });

    return retio;
}
