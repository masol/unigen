import type { UniNode } from "$lib/utils/rete/llmNode";
import type { IRetEditor } from "$lib/utils/rete/type";
import type { ProgreeReporter } from "../type";



export async function runNode(
    editor: IRetEditor,
    node: UniNode,
    inputs: Record<string, string>,
    reporter: ProgreeReporter
): Promise<string> {
    void (node);
    void (inputs);
    reporter("info", `开始执行节点${node.id}`)
    void (reporter);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    reporter("info", `结束执行节点${node.id}`)

    // TODO: 调用 node 的执行函数
    return "";
}