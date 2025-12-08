// import type { Root } from "mdast";
// import type { HtmlWithChildren } from "../../types";
// import { visitParents } from "unist-util-visit-parents";
// import type {  HtmlNodeInfo } from "./types";
import { applyLlm } from '$lib/utils/llms/funcs/promptgen/index'
import Template from './template.txt'

console.log("Template=",Template);
import { Eta } from 'eta';

// import { namedInput } from './namedInput';
// // 工具函数，构建所有的Html节点数组．
// function collectHtmlNodes(tree: Root) {
//     const htmlNodes: Array<HtmlNodeInfo> = [];

//     visitParents(tree, 'html', (node, ancestors) => {
//         const parent = ancestors[ancestors.length - 1];
//         // @ts-expect-error 忽略类型错误．
//         const index = parent?.children?.indexOf(node);

//         if (!parent || index === undefined) return;

//         // @ts-expect-error 检查祖先中是否有 html 节点
//         const hasHtmlAncestor = ancestors.some(ancestor => ancestor.type === 'html');

//         console.log("htmlnode", node, parent, index, ancestors, hasHtmlAncestor)

//         // ancestors 包含从根节点到当前节点父节点的所有节点
//         if (!hasHtmlAncestor) {
//             htmlNodes.push({
//                 node: node as HtmlWithChildren,
//                 parent,
//                 index
//             });
//         }
//     });

//     console.dir(htmlNodes)

//     return htmlNodes;
// }


// 根据mdast,重新调整输入/输出定义，以及过程定义．更形式化．
export async function complete(md: string): Promise<string> {
    // let tree = mdast.tree;

    // const ctx: CompleteContxt = {
    //     htmlNodes: collectHtmlNodes(mdast.tree),
    //     tree: mdast.tree
    // }


    const result = await applyLlm(md);

    const eta = new Eta();
    return eta.renderString(Template, result)

    // console.log("result=", result);




    // if (ctx.htmlNodes.length === 0) {
    //     // 没有内容．收集输出.
    // }

    // console.log("ctx:")
    // console.dir(ctx);

    // // 首先遍历所有输入定义．对其执行named操作．
    // await namedInput(ctx)


    // // 然后遍历所有输出定义．对其执行named操作．



    // // 最后归一化
    // return "";
}
