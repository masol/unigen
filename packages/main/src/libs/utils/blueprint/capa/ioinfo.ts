/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPrjTimeFromArray, stripPrjTimeArray } from "$libs/utils/db/prjstore.js";
import type { CapaIOType } from "$libs/utils/db/schema/capatype.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { PrjTimeStore } from "$types/prjstore.js";
import { getAllIOData } from "./input.js";


export type IOInfo<IType = unknown, OType = unknown> = {
    expired: boolean; // 指示是否已过时，如果目标key不存在，或者目标key的更新时间小于input的时间，则设置为true.否则false.这个值指示是否需要重新计算output.
    inputs: Array<IType | null>;
    outputs: Array<OType | null>;
    inputsWithTime: Array<PrjTimeStore<IType> | null> | null;
    outputsWithTime: Array<PrjTimeStore<OType> | null> | null;
}


export function getIOInfo<ITYpe = any, OType = any>(ctx: IRunnerContext, inputType: CapaIOType[], outputType: CapaIOType[]): IOInfo<ITYpe, OType> {

    const inputs = getAllIOData<ITYpe>(ctx, inputType);
    const outputs = getAllIOData<OType>(ctx, outputType);

    let bExpired = true;
    if (inputs && outputs) {
        const latestInput = getPrjTimeFromArray(inputs, true);
        const earliestOutput = getPrjTimeFromArray(outputs, false);
        if (latestInput && earliestOutput) {
            bExpired = earliestOutput.isBefore(latestInput);
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