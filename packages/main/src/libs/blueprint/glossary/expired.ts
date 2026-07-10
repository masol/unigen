/* eslint-disable @typescript-eslint/no-explicit-any */

import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { getPrjTime } from "$libs/utils/db/prjstore.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { PrjTimeStore } from "$types/prjstore.js";
import { getIOData } from "./input.js";

// 指示哪些项无效了，需要重新计算。输入数组和输出数组长度一定一致。
type ExpiredChunk = number[] | -1;

/**
 * 获取失效的索引数组：对比 input 和 output 数组，标记哪些项需要重新计算
 */
function getExpiredIndices(
    inputs: Array<PrjTimeStore<any> | null> | PrjTimeStore<any> | null,
    outputs: Array<PrjTimeStore<any> | null> | PrjTimeStore<any> | null
): number[] {
    // 如果不是数组关系，返回空数组或 [0]（由全局 expired 判断处理）
    if (!Array.isArray(inputs) || !Array.isArray(outputs)) {
        return [];
    }

    const expired: number[] = [];
    const maxLen = Math.max(inputs.length, outputs.length);

    for (let i = 0; i < maxLen; i++) {
        const input = inputs[i];
        const output = outputs[i];

        // 缺失 input 或 output 视为失效
        if (!input || !output) {
            expired.push(i);
            continue;
        }

        const inputTime = getPrjTime(input, true);   // 获取 input 的最新时间
        const outputTime = getPrjTime(output, false); // 获取 output 的最早时间

        // 如果 output 时间早于 input 时间，说明该项失效
        if (inputTime && outputTime && outputTime.isBefore(inputTime)) {
            expired.push(i);
        } else if (!outputTime) {
            // output 没有有效时间戳，也视为失效
            expired.push(i);
        }
    }

    return expired;
}


/**
 * 获取1对1关系的失效块。两个output/input假定1对1.如果是数组，则要求彼此对应。严格检查output数组对应项的时间在input时间之后。
 * @param ctx 
 * @param inputKey 
 * @param outputType 
 * @returns 
 */
export function getInvalidatedPairs(
    ctx: IRunnerContext,
    inputKey: string,
    outputKey: string
): ExpiredChunk {

    const prjdb: PrjDB = PrjDB.ensure(ctx.prj);

    const inputType = prjdb.getMetag(inputKey)[0];
    const outputType = prjdb.getMetag(outputKey)[0];

    if (!inputType || !outputType) {
        return -1;
    }

    const inputs = getIOData(ctx, inputType);
    const outputs = getIOData(ctx, outputType);

    let expiredIndices: number[] | -1 = [];

    // 判断整体是否失效
    let bGlobalExpired = true;
    if (inputs && outputs) {
        const latestInput = getPrjTime(inputs, true);
        const earliestOutput = getPrjTime(outputs, false);

        if (latestInput && earliestOutput) {
            bGlobalExpired = earliestOutput.isBefore(latestInput);
        }
    } else {
        // 如果 inputs 或 outputs 缺失，视为整体失效
        bGlobalExpired = true;
    }

    // 如果是数组，获取具体失效的索引
    if (Array.isArray(inputs) && Array.isArray(outputs)) {
        expiredIndices = getExpiredIndices(inputs as any, outputs as any);
    } else if (bGlobalExpired) {
        // 非数组情况下，如果整体失效，返回 [-1]
        expiredIndices = -1;
    }

    return expiredIndices;
}