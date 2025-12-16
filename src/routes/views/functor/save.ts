// import { compile, genFunctor } from '$lib/mdast/index'
import { functorStore } from '$lib/stores/project/functor.svelte';
import { projectBase } from '$lib/utils/appdb/project';

export async function saveImpl(md: string, fid: string) {

    const functor = functorStore.find(fid);
    if (functor) {
        functor.extra = functor.extra || { source: md };
        functor.extra.source = md;

        functorStore.update(functor);
        await projectBase.vocabdb.upsert(functor);
    }

    // console.log(md);
    // const mdast = await compile(md);
    // const result = await genFunctor(mdast);
    // console.log("update vocab result=",result);
    // printPositions(mdast.tree);
}

