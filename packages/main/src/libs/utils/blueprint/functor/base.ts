
import { Capability } from "$types/blueprint/capability.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { ICapaFunctor } from "./type.js";


// function getOutputValue(output: any, idx: number): any {
//     if (Array.isArray(output)) {
//         return output.length > idx ? output[idx] : null;
//     }

//     if (idx === 0) return output;
//     return null;
// }

export abstract class BaseFunctor implements ICapaFunctor {

    constructor(readonly capa: Capability) { }
    // 由run实现方主动调用基类的getInput/saveOutput方法来获取输入和保存输出。
    abstract run(ctx: IRunnerContext): Promise<void>;


    // protected saveToOutput(prjDB: PrjDB, output: CapaIOType, value: any): void {
    //     const key = this.getFieldkey(output);
    //     if (key) {
    //         prjDB.set(key, value);
    //     }
    // }

    // public saveOutput(ctx: IRunnerContext, output: unknown): void {
    //     const prjDB: PrjDB = PrjDB.ensure(ctx.prj);
    //     this.capa.output?.forEach((o, idx) => {
    //         const ov = getOutputValue(output, idx)
    //         this.saveToOutput(prjDB, o, ov)
    //     })
    // }

}