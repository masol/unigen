import { functorStore } from '$lib/stores/project/functor.svelte';
import { projectBase } from '$lib/utils/appdb/project';
import { applyLlm } from '$lib/utils/llms/funcs/promptgen/index'
import type { FunctorData } from '$lib/utils/vocab/type';
// import Template from './template.txt'
// import { Eta } from 'eta';

export async function doComplete(md: string, wid: string): Promise<FunctorData> {
    // console.log(md);
    // const mdast = await compile(md);
    const result = await applyLlm(md);
    console.log("update vocab result=", result);

    let functor = functorStore.find(wid);
    if (!functor) {
        functor = await functorStore.newItem(result.functionName);
    } else {
        await functorStore.updateName(wid, result.functionName);
    }
    // const eta = new Eta();
    // const newContent = eta.renderString(Template, {
    //     ...result,
    //     origin: md,
    // })

    functor.word = result.functionName;
    functor.definition = md;
    functor.extra = {
        inputs: [
            {
                type: 'input',
                name: result.inputName,
                definition: result.inputDefinition,
                sample: result.inputExample
            }
        ],
        output: {
            type: 'output',
            name: result.outputName,
            definition: result.outputDefinition,
            sample: result.outputExample
        },
        process: {
            type: 'process',
            name: result.processName,
            definition: result.processDefinition,
            sample: result.processExample
        },
        // source: newContent,
    }

    functorStore.update(functor);
    await projectBase.vocabdb.upsert(functor);

    // printPositions(mdast.tree);
    return functor;
}
