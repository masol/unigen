import { compile, genFunctor } from '$lib/mdast/index'

export async function saveImpl(md: string, fid: string) {
    void(fid);
    // console.log(md);
    const mdast = await compile(md);
    const result = await genFunctor(mdast);
    console.log("update vocab result=",result);
    // printPositions(mdast.tree);
}

