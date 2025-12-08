// import { visitParents } from "unist-util-visit-parents";
import type { HtmlWithChildren } from "../../types";
import type { CompleteContxt } from "./types";
import pMap from "p-map";


// 你的异步处理函数
async function procInput(node: HtmlWithChildren): Promise<HtmlWithChildren> {
    console.log("node=", node)
    // 在这里实现你的逻辑，修改 node.children 和其他属性
    // 示例：
    // node.children = [...];
    // node.value = "...";
    return node;
}

// 对输入<input>块的name做出定义(定义其类型）．并可选增加其抽取函数及验证函数(如未指定，使用时，抽取使用标准函数，验证函数被忽略)．
export async function namedInput(ctx: CompleteContxt): Promise<void> {

    await pMap(ctx.htmlNodes, async (node) => {
        if (node.node.data?.htmlTagName === "input") {
            const procedNode = await procInput(node.node);
            // 更新父节点的 children
            node.parent.children[node.index] = procedNode;
            // 同时更新 htmlNodes 中的引用
            node.node = procedNode;
        }
    },
        { concurrency: 10 } // 可选：控制并发数
    )
    // return ctx.tree;
}
