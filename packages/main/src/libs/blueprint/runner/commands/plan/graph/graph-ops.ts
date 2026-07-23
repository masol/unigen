/**
 * 无状态图算法：只对单个 DirectedGraph 操作，不依赖 GDag 实例状态。
 * GDag 的相关方法退化为「取图 → 调此处纯函数」的薄封装。
 */
import { PNode } from "$types/shared/plan/nodes.js";
import { DirectedGraph } from "graphology";
import { topologicalSort } from "graphology-dag";

/** 某节点的全部祖先（上游可达集，不含自身） */
export function ancestorsOf(g: DirectedGraph, nodeId: string): Set<string> {
    const acc = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
        const cur = queue.shift()!;
        g.forEachInNeighbor(cur, (nb) => {
            if (!acc.has(nb)) { acc.add(nb); queue.push(nb); }
        });
    }
    return acc;
}

/** 某节点的全部后代（下游可达集，不含自身） */
export function descendantsOf(g: DirectedGraph, nodeId: string): Set<string> {
    const acc = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
        const cur = queue.shift()!;
        g.forEachOutNeighbor(cur, (nb) => {
            if (!acc.has(nb)) { acc.add(nb); queue.push(nb); }
        });
    }
    return acc;
}

/** 本层被产出的交付物名集合 */
export function producedNames(g: DirectedGraph): Set<string> {
    const s = new Set<string>();
    g.forEachNode((_, attrs) => {
        for (const o of (attrs as PNode).outputs) s.add(o);
    });
    return s;
}

/** 本层初始材料（被消费但无人产出的输入） */
export function initialArtifacts(g: DirectedGraph): string[] {
    const produced = producedNames(g);
    const out = new Set<string>();
    g.forEachNode((_, attrs) => {
        for (const i of (attrs as PNode).inputs)
            if (!produced.has(i)) out.add(i);
    });
    return [...out];
}

/** 本层终端成果（被产出但无人消费的输出） */
export function terminalArtifacts(g: DirectedGraph): string[] {
    const consumed = new Set<string>();
    g.forEachNode((_, attrs) => {
        for (const i of (attrs as PNode).inputs) consumed.add(i);
    });
    const out: string[] = [];
    g.forEachNode((_, attrs) => {
        for (const o of (attrs as PNode).outputs)
            if (!consumed.has(o)) out.push(o);
    });
    return out;
}

/** 终端节点集合：产出至少一个终端成果的节点 id */
export function terminalNodeIds(g: DirectedGraph): Set<string> {
    const terms = new Set(terminalArtifacts(g));
    const ids = new Set<string>();
    g.forEachNode((nid, attrs) => {
        for (const o of (attrs as PNode).outputs)
            if (terms.has(o)) { ids.add(nid); break; }
    });
    return ids;
}

/**
 * 节点在本层 DAG 中的结构地位信号（供展开价值判断使用）。
 * 全部为客观图属性，不涉及语义。
 */
export interface NodeStructuralSignal {
    /** 下游直接消费者数量（出度维度：本节点产出被多少后继直接消费） */
    directConsumers: number;
    /** 下游可达节点总数（承重的广度信号） */
    totalDescendants: number;
    /** 到最近终端成果的最短跳数；本身即终端为 0；不可达终端为 -1 */
    distanceToTerminal: number;
    /** 是否位于关键路径：即从某个初始材料到某个终端成果的最长链上 */
    onCriticalPath: boolean;
}

/** 最短路：node → 最近终端节点的跳数（BFS，无权） */
function distanceToTerminal(g: DirectedGraph, nodeId: string, terminals: Set<string>): number {
    if (terminals.has(nodeId)) return 0;
    const visited = new Set<string>([nodeId]);
    let frontier = [nodeId];
    let dist = 0;
    while (frontier.length > 0) {
        dist++;
        const next: string[] = [];
        for (const cur of frontier) {
            let hit = false;
            g.forEachOutNeighbor(cur, (nb) => {
                if (terminals.has(nb)) hit = true;
                if (!visited.has(nb)) { visited.add(nb); next.push(nb); }
            });
            if (hit) return dist;
        }
        frontier = next;
    }
    return -1;
}

/**
 * 关键路径识别：整层做一次最长路 DP（DAG 上按拓扑序），
 * 落在「达到全局最长链长度」的那条(或那些)链上的节点标记为关键。
 * 返回关键节点 id 集合。
 */
export function criticalPathNodes(g: DirectedGraph): Set<string> {
    const order = topologicalSort(g);
    // longest[u] = 从任意源点到 u 的最长路径长度（按边计）
    const longest = new Map<string, number>();
    for (const u of order) {
        let best = 0;
        g.forEachInNeighbor(u, (p) => {
            best = Math.max(best, (longest.get(p) ?? 0) + 1);
        });
        longest.set(u, best);
    }
    // down[u] = 从 u 出发到任意汇点的最长路径长度
    const down = new Map<string, number>();
    for (const u of [...order].reverse()) {
        let best = 0;
        g.forEachOutNeighbor(u, (c) => {
            best = Math.max(best, (down.get(c) ?? 0) + 1);
        });
        down.set(u, best);
    }
    let globalMax = 0;
    for (const u of order) globalMax = Math.max(globalMax, (longest.get(u) ?? 0) + (down.get(u) ?? 0));

    const critical = new Set<string>();
    for (const u of order)
        if ((longest.get(u) ?? 0) + (down.get(u) ?? 0) === globalMax) critical.add(u);
    return critical;
}

/** 计算单节点结构信号（关键路径集可外部预算好传入以复用） */
export function structuralSignal(
    g: DirectedGraph, nodeId: string,
    terminals: Set<string> = terminalNodeIds(g),
    critical: Set<string> = criticalPathNodes(g),
): NodeStructuralSignal {
    let directConsumers = 0;
    g.forEachOutNeighbor(nodeId, () => { directConsumers++; });
    return {
        directConsumers,
        totalDescendants: descendantsOf(g, nodeId).size,
        distanceToTerminal: distanceToTerminal(g, nodeId, terminals),
        onCriticalPath: critical.has(nodeId),
    };
}