/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { getPrjTimeFromArray, stripPrjTimeArray } from "$libs/utils/db/prjstore.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { PrjTimeStore } from "$types/prjstore.js";
import dayjs from "dayjs";
import { Capability } from "../capability/is.js";
import { getAllIOData } from "./input.js";


export type IOInfo<IType = unknown, OType = unknown> = {
    expired: boolean; // 指示是否已过时，如果目标key不存在，或者目标key的更新时间小于input的时间，则设置为true.否则false.这个值指示是否需要重新计算output.
    inputs: Array<IType | null>;
    outputs: Array<OType | null>;
    inputsWithTime: Array<PrjTimeStore<IType> | null> | null;
    outputsWithTime: Array<PrjTimeStore<OType> | null> | null;
}

/**
 * 获取全部IO对象，并判断是否失效。(资源，输入包括capa自身，更新时间都需要早于输出，否则expired.)
 * 但是未使用schema验证数据内容，策略是写入时验证，而不是读取时验证。
 * @param capa 能力对象
 * @param reses 依赖资源。 
 * @param inputKeys 输入metag数组，如未指定，使用capa.input.
 * @param outputKeys 输出metag数组，如未指定，使用capa.output.
 * @returns IOInfo
 */
export function getIOInfo<ITYpe = any, OType = any>(ctx: IRunnerContext, capa: Capability,
    reses?: string[], inputKeys?: string[],
    outputKeys?: string[]): IOInfo<ITYpe, OType> {

    inputKeys = inputKeys ?? capa.input;
    outputKeys = outputKeys ?? capa.output;

    const prjdb: PrjDB = PrjDB.ensure(ctx.prj);
    const inputMetag = prjdb.getMetag(inputKeys);
    const outputMetag = prjdb.getMetag(outputKeys);
    const inputs = getAllIOData<ITYpe>(ctx, inputMetag);
    const outputs = getAllIOData<OType>(ctx, outputMetag);

    let bExpired = true;
    if (inputs && outputs) {
        const latestInput = getPrjTimeFromArray(inputs, true);
        const earliestOutput = getPrjTimeFromArray(outputs, false);
        if (earliestOutput) {
            if (latestInput) {
                bExpired = earliestOutput.isBefore(latestInput);
            }

            // output有效。开始检查capa是否在output之后更新了。
            if (!bExpired && capa.updatedAt) {
                bExpired = dayjs(capa.updatedAt).isAfter(earliestOutput);
            }

            // output有效，开始检查依赖资源是否在output之后更新了。
            if (!bExpired && reses && reses.length > 0) {
                const timesMap = prjdb.geUpdTime(reses);
                if (timesMap) {
                    let currentResTime = dayjs(0);
                    const times = Object.values(timesMap);
                    for (const t of times) {
                        if (t) {
                            const dayt = dayjs(t);
                            if (dayt.isAfter(currentResTime)) {
                                currentResTime = dayt;
                            }
                        }
                    }
                    // currentResTime保存了最新时间的resource(或1970.1.1)，如果比最早的output晚，说明有资源在output之后更新。标记output已过期。
                    bExpired = currentResTime.isAfter(earliestOutput);
                }
            }
        }
    }


    return {
        expired: bExpired,
        inputs: stripPrjTimeArray<ITYpe>(inputs),
        outputs: stripPrjTimeArray<OType>(outputs),
        inputsWithTime: inputs,   // 原始值未被修改，直接返回
        outputsWithTime: outputs, // 原始值未被修改，直接返回
    }
}