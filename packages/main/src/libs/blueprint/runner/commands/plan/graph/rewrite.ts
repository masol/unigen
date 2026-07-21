/**
 * ============================================================================
 * 【P-graph · rewrite:纯图变换(map-reduce 展开 + 展平)】
 * ============================================================================
 * 只操作 DirectedGraph,不触碰注册表:map-reduce 的中间产物名唯一
 * (outputName__chunks / __chunk_results),无需归一。
 */
import { Artifact, PNode } from "$types/shared/plan/nodes.js";
import Logger from "electron-log/main.js";
import { DirectedGraph } from "graphology";

/** 合并式加边:同一对节点的多份数据流并到一条边,artifacts 去重累积 */
function link(g: DirectedGraph, from: string, to: string, arts: string[]): void {
    if (arts.length === 0) return;
    if (g.hasEdge(from, to)) {
        const prev = g.getEdgeAttribute(from, to, 'artifacts') as string[];
        g.setEdgeAttribute(from, to, 'artifacts', [...new Set([...prev, ...arts])]);
    } else {
        g.addEdge(from, to, { artifacts: [...arts] });
    }
}

/** 构造完整 Artifact(补全缺省字段) */
function makeArtifact(name: string, intent: string): Artifact {
    return { name, intent, qualityCriteria: [], sizeEstimate: 'small' };
}

/**
 * 把目标叶子在同层内替换为 split → map → reduce。
 * split/reduce 为确定性 code(facet codeable=yes);map 继承原节点语义(synthetic)。
 * reduce 输出沿用原 outputName,对外契约不变。全部产物名唯一,不产生重复产出者。
 */
export function mapReduceRewrite(
    g: DirectedGraph, targetNodeId: string, splitArtifactName: string,
): void {
    if (!g.hasNode(targetNodeId)) throw new Error(`[rewrite] 节点不存在:${targetNodeId}`);
    const target = g.getNodeAttributes(targetNodeId) as PNode;
    if (target.outputs.length !== 1)
        throw new Error(`[rewrite] map-reduce 仅支持单输出节点:${target.name}`);

    const outputName = target.outputs[0].name;
    const splitInput = target.inputs.find(i => i.name === splitArtifactName);
    if (!splitInput)
        throw new Error(`[rewrite] 节点「${target.name}」不消费「${splitArtifactName}」`);

    const chunks = `${outputName}__chunks`;
    const chunkResults = `${outputName}__chunk_results`;

    const detBase = {
        status: 'awaiting_code' as const, dag: null, error: null,
        facets: { codeable: 'yes' as const }, synthetic: true,
    };

    const splitNode: PNode = {
        id: crypto.randomUUID(), name: `切分-${target.name}`, kind: 'split',
        intent: `将「${splitArtifactName}」切分为可并行处理的分片清单`,
        inputs: [splitInput], // 复用原 Artifact 对象(已含完整字段)
        outputs: [makeArtifact(chunks, `「${outputName}」的分片清单`)],
        ...detBase,
    };

    const mapNode: PNode = {
        ...target,
        id: crypto.randomUUID(), name: `映射-${target.name}`, kind: 'map',
        inputs: target.inputs.map(i =>
            i.name === splitArtifactName
                ? makeArtifact(chunks, `「${outputName}」的分片清单`)
                : i // 保留原 Artifact 对象(完整字段)
        ),
        outputs: [makeArtifact(chunkResults, `「${outputName}」各分片结果`)],
        dag: null, error: null, synthetic: true, status: 'awaiting_code',
    };

    const reduceNode: PNode = {
        id: crypto.randomUUID(), name: `归约-${target.name}`, kind: 'reduce',
        intent: `合并所有分片结果为完整「${outputName}」`,
        inputs: [makeArtifact(chunkResults, `「${outputName}」各分片结果`)],
        outputs: target.outputs, // 原 outputs 已是完整 Artifact[]
        ...detBase,
    };

    const inEdges = g.inEdges(targetNodeId).map(e => ({
        src: g.source(e), artifacts: g.getEdgeAttribute(e, 'artifacts') as string[],
    }));
    const outEdges = g.outEdges(targetNodeId).map(e => ({
        dst: g.target(e), artifacts: g.getEdgeAttribute(e, 'artifacts') as string[],
    }));

    g.addNode(splitNode.id, splitNode);
    g.addNode(mapNode.id, mapNode);
    g.addNode(reduceNode.id, reduceNode);
    link(g, splitNode.id, mapNode.id, [chunks]);
    link(g, mapNode.id, reduceNode.id, [chunkResults]);

    // 入边:被分片的数据 → split;其余输入 → map
    for (const e of inEdges) {
        const toSplit = e.artifacts.filter(a => a === splitArtifactName);
        const toMap = e.artifacts.filter(a => a !== splitArtifactName);
        link(g, e.src, splitNode.id, toSplit);
        link(g, e.src, mapNode.id, toMap);
    }
    // 出边:原下游 → reduce
    for (const e of outEdges) link(g, reduceNode.id, e.dst, e.artifacts);

    g.dropNode(targetNodeId);
    Logger.debug(`[rewrite] map-reduce 展开:「${target.name}」→ split/map/reduce`);
}

/**
 * 多层展平为单层可执行 DAG。
 * 【为何按名重连即可】产物全局归一 + 子层边界锁(子层初始=父输入、
 * 终端=父输出),故收集全部叶子后,用 producer→consumer 名称规则重推边,
 * 天然缝合所有跨层边界。展开(非叶)节点只是归约视图,丢弃即可。
 * 重复产出者视为建模错误,显式报错。
 */
export function flattenGraphs(graphs: Map<string, DirectedGraph>): DirectedGraph {
    const leaves: PNode[] = [];
    for (const g of graphs.values()) {
        g.forEachNode((_, attrs) => {
            const n = attrs as PNode;
            if (!n.dag) leaves.push(n);
        });
    }

    const flat = new DirectedGraph();
    const producer = new Map<string, string>(); // 正式名 → node.id
    for (const n of leaves) {
        if (!flat.hasNode(n.id)) flat.addNode(n.id, { ...n });
        for (const o of n.outputs) {
            const dup = producer.get(o.name);
            if (dup && dup !== n.id)
                throw new Error(`[flatten] 交付物「${o.name}」有多个产出者,无法展平`);
            producer.set(o.name, n.id);
        }
    }
    for (const n of leaves) {
        for (const i of n.inputs) {
            const from = producer.get(i.name);
            if (!from || from === n.id) continue; // 初始数据无边
            link(flat, from, n.id, [i.name]);
        }
    }
    return flat;
}