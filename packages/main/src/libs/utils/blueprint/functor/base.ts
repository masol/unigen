/* eslint-disable @typescript-eslint/no-explicit-any */
import { Capability } from "$types/blueprint/capability.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { isPlainObject } from "radashi";
import { ICapaFunctor } from "./type.js";
import { CapaIOType } from "$libs/utils/db/schema/capahelper.js";
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";


function getOutputValue(output: any, idx: number): any {
    if (Array.isArray(output)) {
        return output.length > idx ? output[idx] : null;
    }

    if (idx === 0) return output;
    return null;
}

export abstract class BaseFunctor implements ICapaFunctor {

    constructor(protected capa: Capability) { }

    abstract runImpl(ctx: IRunnerContext, input: unknown[]): Promise<unknown>;

    protected instantFieldkey(io: CapaIOType): string {
        if (isPlainObject(io)) {
            return io.fieldKey;
        }
        return ""
    }

    protected loadFromInput(prjDB: PrjDB, input: CapaIOType): any {
        const key = this.instantFieldkey(input);
        if (key) {
            return prjDB.get(key);
        }
        return null;
    }

    protected saveToOutput(prjDB: PrjDB, output: CapaIOType, value: any): void {
        const key = this.instantFieldkey(output);
        if (key) {
            prjDB.set(key, value);
        }
    }

    async run(ctx: IRunnerContext): Promise<void> {
        const input: any[] = [];
        const prjDB: PrjDB = PrjDB.ensure(ctx.prj);
        this.capa.input?.forEach((i) => {
            input.push(this.loadFromInput(prjDB, i));
        })
        const output = await this.runImpl(ctx, input);
        this.capa.output?.forEach((o, idx) => {
            const ov = getOutputValue(output, idx)
            this.saveToOutput(prjDB, o, ov)
        })
    }
}