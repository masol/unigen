import { PNode } from "$types/shared/plan/nodes.js";
import { DirectedGraph } from "graphology";

function link(g: DirectedGraph, from: string, to: string, arts: string[]): void {
    if (arts.length === 0) return;
    if (g.hasEdge(from, to)) {
        const prev = g.getEdgeAttribute(from, to, 'artifacts') as string[];
        g.setEdgeAttribute(from, to, 'artifacts', [...new Set([...prev, ...arts])]);
    } else {
        g.addEdge(from, to, { artifacts: [...arts] });
    }
}

/**
 * 多层展平为单层可执行 DAG。
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
    const producer = new Map<string, string>();
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
            if (!from || from === n.id) continue;
            link(flat, from, n.id, [i.name]);
        }
    }
    return flat;
}