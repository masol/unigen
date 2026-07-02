/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CapaIOType } from "$libs/utils/db/schema/capatype.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { getAllIOData } from "./input.js";
import { getPrjTime, stripPrjTime } from "./util.js";


export type IOInfo<IType = unknown, OType = unknown> = {
    expired: boolean; // 指示是否已过时，如果目标key不存在，或者目标key的更新时间小于input的时间，则设置为true.否则false.这个值指示是否需要重新计算output.
    input: Array<IType | null>;
    output: Array<OType | null>;
}


export function getIOInfo<ITYpe = any, OType = any>(ctx: IRunnerContext, inputType: CapaIOType[], outputType: CapaIOType[]): IOInfo<ITYpe, OType> {

    const inputs = getAllIOData<ITYpe>(ctx, inputType);
    const outputs = getAllIOData<OType>(ctx, outputType);

    let bExpired = true;
    if (inputs && outputs) {
        const latestInput = getPrjTime(inputs, true);
        const earliestOutput = getPrjTime(outputs, false);
        if (latestInput && earliestOutput) {
            bExpired = earliestOutput.isBefore(latestInput);
        }
    }


    return {
        expired: bExpired,
        input: stripPrjTime<ITYpe>(inputs),
        output: stripPrjTime<OType>(outputs),
    }
}