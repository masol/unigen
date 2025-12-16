import { type ProgreeReporter } from "../type";
import type { IRetEditor } from "$lib/utils/rete/type";
import { Graph, alg } from "@dagrejs/graphlib";
import type { RunContext, Resolve, Reject } from "./type";
import { runNode } from "./runNode";
import { NoReadyError, RunError } from "./error";
import { functorStore } from "$lib/stores/project/functor.svelte";


function deferred<T>() {
    let resolve!: Resolve<T>;
    let reject!: Reject;

    const value = new Promise<T>((res, rej) => {
        resolve = res as Resolve<T>;
        reject = rej as Reject;
    });

    return { value, resolve, reject };
}

function analyzeGraph(g: Graph) {
    const components = alg.components(g);
    const isConnected = components.length === 1;

    const isolatedNodes: string[] = [];

    // 只有在图不连通时，才需要查找孤立节点
    if (!isConnected) {
        const allNodes = g.nodes();

        allNodes.forEach(nodeId => {
            const inEdges = g.inEdges(nodeId) || [];
            const outEdges = g.outEdges(nodeId) || [];

            if (inEdges.length === 0 && outEdges.length === 0) {
                isolatedNodes.push(nodeId);
            }
        });
    }

    return {
        isConnected,
        isolatedNodes
    };
}

export async function runImpl(editor: IRetEditor, reporter: ProgreeReporter) {
    const g = new Graph();


    const incomNodes: string[] = []

    const uniNodes = editor.getNodes();

    uniNodes.forEach(node => {
        g.setNode(node.id);
        if (node.fid) {
            const functor = functorStore.find(node.fid);
            if (!functor) {
                // @todo: 这里还需要查找flowStore.
                incomNodes.push(node.id)
            } else if (!functor.extra) {
                incomNodes.push(node.id);
            }
        } else {
            incomNodes.push(node.id);
        }
    });

    if (incomNodes.length > 0) {
        throw new NoReadyError("有节点未定义", incomNodes);
    }

    const connections = editor.getConnections();
    connections.forEach((c) => {
        g.setEdge(c.source, c.target);
    })

    const isloated = analyzeGraph(g);
    if (!isloated.isConnected) {
        throw new RunError("非连通，有孤立节点未连接！", isloated.isConnected, isloated.isolatedNodes);
    }

    // @todo: 检查循环依赖的合法性－－是否可停机？
    // const cycles = alg.findCycles(g); // 返回数组，如 ['A','B','A']

    // 无需拓扑排序，直接使用输入依赖关系来
    const order = alg.topsort(g);   // 拓扑排序（前 → 后）

    // 1) 先创建 RunContext，并为所有节点建立 deferred Promise
    const ctx: RunContext = Object.fromEntries(
        order.map((nodeId) => [nodeId, { result: deferred<string>() }])
    ) as RunContext;


    // 2) 建立每个节点的执行任务（不使用 for 循环串行 await）
    //    关键点：每个节点的输入直接 await 依赖节点的 Promise，从而最大化并行。
    const tasks = order.map(async (nodeId) => {
        const node = editor.getNode(nodeId);
        if (!node) {
            ctx[nodeId].result.reject(new Error(`Node not found: ${nodeId}`));
            return;
        }

        try {
            // 找到所有流入 nodeId 的连接：source -> nodeId
            const incoming = connections.filter((c) => c.target === nodeId);

            // 将依赖节点的输出 Promise 作为输入（等待依赖即可）
            // 这里的 key 你可以按需换成：input socket 名、connection id 等
            const inputsEntries = await Promise.all(
                incoming.map(async (c) => {
                    const v = await ctx[c.source].result.value;
                    return [c.source, v] as const;
                })
            );
            const inputs = Object.fromEntries(inputsEntries);

            const out = await runNode(editor, node, inputs, reporter);
            ctx[nodeId].result.resolve(out);
        } catch (e) {
            ctx[nodeId].result.reject(e as unknown as Error);
        }
    });

    // 3) 等待全部节点完成（此处是并行等待，不是逐个 for-await 串行）
    await Promise.all(tasks);

    return ctx;
}