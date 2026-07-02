import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { type Capability, getInternalName, isWorkflow } from "$libs/utils/blueprint/capa/is.js";
import { throwNotimplement } from "$libs/utils/err.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { DirectedGraph } from "graphology";
import { ICapaFunctor } from "./type.js";
import { DagFunctor } from "./dag.js";
import { intereg } from "./intereg.js";
// import memoize from 'memoize';


// 不需要使用memoize来缓存，并没有太高开销，反而增加内存泄漏风险(ICapaRunner被缓存而无法释放)
function loadDag(capa: Capability): ICapaFunctor | null {
    const graphString = capa.process?.join('');
    if (graphString) {
        const serializedObject = JSON.parse(graphString);
        const dag = DirectedGraph.from(serializedObject);
        return new DagFunctor(capa, dag);
    }
    return null;
}

export function loadFunctor(ctx: IRunnerContext, capaId: string): ICapaFunctor | null {
    const prjdb = PrjDB.ensure(ctx.prj);

    const capa = prjdb.getCapaById(capaId);
    if (!capa) return null;
    if (isWorkflow(capa)) {
        // console.log("capa==", capa)
        return loadDag(capa);
    }
    const interName = getInternalName(capa);
    if (interName) {
        return intereg.get(interName);
    }
    throwNotimplement(`尚未实现通用LLM调用:${capa}`)
}