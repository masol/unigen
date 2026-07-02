/* eslint-disable @typescript-eslint/no-explicit-any */

import { CapaIOType } from "$libs/utils/db/schema/capatype.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { PrjTimeStore } from "$types/prjstore.js";
import { getIOData } from "./input.js";
import { getPrjTime } from "./util.js";

export type ExpiredChunk<IType, OType> = {
    expired: number[] | -1; // 指示哪些项无效了，需要重新计算。
    input: IType | null,
    output: OType | null
}

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
 * 剥离时间戳信息，返回纯数据
 */
function stripPrjTime<T>(data: PrjTimeStore<T> | Array<PrjTimeStore<T> | null> | null): T {
    if (!data) return data as T;

    if (Array.isArray(data)) {
        return data.map(item => item?.value ?? null) as T;
    }

    return data.value;
}


/**
 * 获取1对1关系的失效块。两个output/input假定1对1.如果是数组，则要求彼此对应。严格检查output数组对应项的时间在input时间之后。
 * @param ctx 
 * @param inputType 
 * @param outputType 
 * @returns 
 */
export function getExpiredChunk<IType = any, OType = any>(
    ctx: IRunnerContext,
    inputType: CapaIOType,
    outputType: CapaIOType
): ExpiredChunk<IType, OType> {

    const inputs = getIOData<IType>(ctx, inputType);
    const outputs = getIOData<OType>(ctx, outputType);

    let expiredIndices: number[] | -1 = [];

    // 判断整体是否失效
    let bGlobalExpired = true;
    if (inputs && outputs) {
        const latestInput = getPrjTime(inputs as any, true);
        const earliestOutput = getPrjTime(outputs as any, false);

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

    return {
        expired: expiredIndices,
        input: stripPrjTime<IType>(inputs as any),
        output: stripPrjTime<OType>(outputs as any),
    };
}