

import { complete } from '$lib/mdast/index'

export async function doComplete(md: string): Promise<string> {
    // console.log(md);
    // const mdast = await compile(md);
    const result = await complete(md);
    console.log("update vocab result=", result);
    // printPositions(mdast.tree);
    return result;
}
