import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { type Capability, getInternalName, isWorkflow } from "$libs/utils/db/schema/capahelper2.js";
import { throwNotimplement } from "$libs/utils/err.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { DirectedGraph } from "graphology";
import { ICapaRunner } from "./type.js";
import { DagRunner } from "./dagrunner.js";


function loadDag(capa: Capability): ICapaRunner | null {

    const graphString = capa.process?.join('');
    if (graphString) {
        const serializedObject = JSON.parse(graphString);
        const dag = DirectedGraph.from(serializedObject);
        return new DagRunner(dag);
    }
    return null;
}

export function loadRunner(ctx: IRunnerContext, capaId: string): ICapaRunner | null {
    const prjdb = PrjDB.ensure(ctx.prj);

    const capa = prjdb.getCapaById(capaId);
    if (!capa) return null;
    if (isWorkflow(capa)) {
        return loadDag(capa);
    }
    const interName = getInternalName(capa);
    if (interName) {
        throwNotimplement(`尚未实现Internal Run:${interName}`)
    }
    throwNotimplement(`尚未实现通用LLM调用:${capa}`)
}