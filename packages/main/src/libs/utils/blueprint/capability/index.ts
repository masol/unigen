// 处理capability的内存态--一旦capability加载进入内容，相当于传统的functor.

import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { type Capability, getInternalName, isCode, isWorkflow } from "$libs/utils/blueprint/capability/is.js";
import { throwNotimplement } from "$libs/utils/err.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { DirectedGraph } from "graphology";
import { VmCapaFunctor } from "./code/index.js";
import { DagFunctor } from "./dag.js";
import { intereg } from "./intereg.js";
import { ICapaFunctor } from "./type.js";
// import memoize from 'memoize';


// 不需要使用memoize来缓存，并没有太高开销，反而增加内存泄漏风险(ICapaRunner被缓存而无法释放)
function loadDag(capa: Capability): ICapaFunctor | null {
    const graphString = capa.code;
    if (graphString) {
        const serializedObject = JSON.parse(graphString);
        const dag = DirectedGraph.from(serializedObject);
        return new DagFunctor(capa, dag);
    }
    return null;
}

function loadCode(capa: Capability): ICapaFunctor | null {
    const code = capa.code;
    if (!code) {
        throwNotimplement(`代码节点${capa.id}(${capa.name})没有提供任意代码。`)
    }
    return new VmCapaFunctor(capa);
}

function loadLLMNode(capa: Capability): ICapaFunctor | null {
    throwNotimplement(`尚未实现通用LLM调用:${capa}`)
}

export function loadFunctor(ctx: IRunnerContext, capaId: string): ICapaFunctor | null {
    const prjdb = PrjDB.ensure(ctx.prj);

    const capa = prjdb.getCapaById(capaId);
    if (!capa) return null;
    if (isWorkflow(capa.name)) {
        // console.log("capa==", capa)
        return loadDag(capa);
    } else if (isCode(capa.name)) {
        return loadCode(capa);
    }

    const interName = getInternalName(capa.name);
    if (interName) {
        return intereg.get(interName);
    }

    return loadLLMNode(capa);
}