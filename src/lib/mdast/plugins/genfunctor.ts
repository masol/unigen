import type { FunctorData } from "$lib/utils/vocab/type";
import type { CompileResult } from "../types";


// 根据mdast生成对应的FunctorData(无id等附加信息)．
export async function genFunctor(mdast: CompileResult): Promise<Partial<FunctorData> | null> {
    void (mdast);
    return null;
}
