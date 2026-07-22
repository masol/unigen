import type { IRunnerContext } from '$types/blueprint/context.js';
import {
    GDagJSON, Io, PNode, RegArtifact, TriState,
} from "$types/shared/plan/nodes.js";
import { DirectedGraph } from "graphology";
import { topologicalSort } from "graphology-dag";
import { NodeStatus } from "../../plan-htn/types.js";
import { ArtifactCand, ArtifactRegistry } from "./registry.js";
import { flattenGraphs } from "./rewrite.js";
import { Semaphore } from "./semaphore.js";

export const FacetNames = {
    simple: 'simple',
    codeable: 'codeable',
    lib: 'lib',
} as const;

export function getFacet(n: PNode, facet: string): TriState {
    return n.facets?.[facet] ?? 'pending';
}

export const NodeStatusValue: Record<string, NodeStatus> = {
    pending: 'pending' as NodeStatus,
    expanding: 'expanding' as NodeStatus,
    expanded: 'expanded' as NodeStatus,
    awaiting_code: 'awaiting_code' as NodeStatus,
    done: 'done' as NodeStatus,
    conflict: 'conflict' as NodeStatus,
} as const;

export interface WalkEntry { graphId: string; depth: number; node: PNode; }
export type WalkControl = 'skip' | 'stop' | void;
export type WalkVisitor = (e: WalkEntry) => Promise<WalkControl> | WalkControl;

export interface WalkOptions {
    startGraphId?: string;
    filter?: (n: PNode) => boolean;
    concurrency?: number;
}

interface WalkState { stopped: boolean; errors: unknown[]; }

export class GDag {
    #graphs = new Map<string, DirectedGraph>();
    rootId: string | null = null;
    #registry = new ArtifactRegistry();

    // ── 产物注册表委托 ────────────────────────────────────────────────────

    registerArtifact(cand: ArtifactCand, ctx: IRunnerContext): Promise<string> {
        return this.#registry.register(cand, ctx);
    }
    resolveName(name: string): string | null { return this.#registry.resolveName(name); }
    getArtifact(name: string): RegArtifact | null { return this.#registry.get(name); }
    allArtifacts(): RegArtifact[] { return this.#registry.all(); }

    /** 便捷方法：通过名称获取 Io（name + intent） */
    getIo(name: string): Io | null {
        const a = this.#registry.get(name);
        return a ? { name: a.name, intent: a.intent } : null;
    }

    /** 批量获取 Io */
    getIos(names: string[]): Io[] {
        return names
            .map(n => this.getIo(n))
            .filter((io): io is Io => io !== null);
    }

    // ── 图管理 ──────────────────────────────────────────────────────────────

    createLayer(nodes: PNode[], asRoot = false): string {
        const g = new DirectedGraph();
        const producer = new Map<string, string>();
        for (const n of nodes) {
            g.addNode(n.id, { ...n });
            for (const o of n.outputs) producer.set(o, n.id);
        }
        for (const n of nodes) {
            for (const i of n.inputs) {
                const from = producer.get(i);
                if (!from || from === n.id) continue;
                this.#link(g, from, n.id, [i]);
            }
        }
        const id = crypto.randomUUID();
        this.#graphs.set(id, g);
        if (asRoot) this.rootId = id;
        return id;
    }

    getGraph(id: string): DirectedGraph | null { return this.#graphs.get(id) ?? null; }

    dropGraph(id: string): void {
        if (id === this.rootId) throw new Error(`[gdag] 根层禁止丢弃`);
        this.#graphs.delete(id);
    }

    findNode(nodeId: string): { graphId: string; node: PNode } | null {
        for (const [gid, g] of this.#graphs) {
            if (g.hasNode(nodeId))
                return { graphId: gid, node: g.getNodeAttributes(nodeId) as PNode };
        }
        return null;
    }

    updateNode(nodeId: string, patch: Partial<PNode>): void {
        const hit = this.findNode(nodeId);
        if (!hit) throw new Error(`[gdag] 节点不存在:${nodeId}`);
        this.#graphs.get(hit.graphId)!.mergeNodeAttributes(nodeId, patch);
    }

    setFacet(nodeId: string, facet: string, value: TriState): void {
        const hit = this.findNode(nodeId);
        if (!hit) throw new Error(`[gdag] 节点不存在:${nodeId}`);
        this.#graphs.get(hit.graphId)!
            .setNodeAttribute(nodeId, 'facets', { ...hit.node.facets, [facet]: value });
    }

    attachSubDag(nodeId: string, subGraphId: string): void {
        this.updateNode(nodeId, { dag: subGraphId, status: 'expanded' });
    }

    scan(status: NodeStatus): { graphId: string; node: PNode }[] {
        const out: { graphId: string; node: PNode }[] = [];
        for (const [gid, g] of this.#graphs) {
            g.forEachNode((_, attrs) => {
                const n = attrs as PNode;
                if (n.status === status) out.push({ graphId: gid, node: n });
            });
        }
        return out;
    }

    // ── 上游数据池 ──────────────────────────────────────────────────────────

    upstreamPool(graphId: string, nodeId: string): Io[] {
        const g = this.#graphs.get(graphId);
        if (!g || !g.hasNode(nodeId)) return [];

        const ancestors = new Set<string>();
        const queue = [nodeId];
        while (queue.length > 0) {
            const cur = queue.shift()!;
            g.forEachInNeighbor(cur, (nb) => {
                if (!ancestors.has(nb)) { ancestors.add(nb); queue.push(nb); }
            });
        }

        const self = g.getNodeAttributes(nodeId) as PNode;
        const taken = new Set(self.inputs);
        const pool = new Map<string, Io>();
        const add = (name: string): void => {
            if (!taken.has(name) && !pool.has(name)) {
                const io = this.getIo(name);
                if (io) pool.set(name, io);
            }
        };

        for (const aid of ancestors) {
            const a = g.getNodeAttributes(aid) as PNode;
            for (const o of a.outputs) add(o);
        }
        const produced = new Set<string>();
        g.forEachNode((_, attrs) => {
            for (const o of (attrs as PNode).outputs) produced.add(o);
        });
        g.forEachNode((_, attrs) => {
            for (const i of (attrs as PNode).inputs)
                if (!produced.has(i)) add(i);
        });
        return [...pool.values()];
    }

    addNodeInputs(graphId: string, nodeId: string, extraNames: string[]): void {
        if (extraNames.length === 0) return;
        const g = this.#graphs.get(graphId);
        if (!g || !g.hasNode(nodeId)) throw new Error(`[gdag] 节点不存在:${nodeId}`);
        const node = g.getNodeAttributes(nodeId) as PNode;
        const have = new Set(node.inputs);
        const added = extraNames.filter(n => !have.has(n));
        if (added.length === 0) return;
        g.setNodeAttribute(nodeId, 'inputs', [...node.inputs, ...added]);

        const producer = new Map<string, string>();
        g.forEachNode((nid, attrs) => {
            for (const o of (attrs as PNode).outputs) producer.set(o, nid);
        });
        for (const name of added) {
            const from = producer.get(name);
            if (!from || from === nodeId) continue;
            this.#link(g, from, nodeId, [name]);
        }
    }

    // ── 遍历 ────────────────────────────────────────────────────────────────

    topoNodes(graphId: string): PNode[] {
        const g = this.#graphs.get(graphId);
        if (!g) return [];
        return topologicalSort(g).map(id => g.getNodeAttributes(id) as PNode);
    }

    layerDepths(): Map<string, number> {
        const depths = new Map<string, number>();
        if (!this.rootId) return depths;
        const rec = (gid: string, d: number): void => {
            if (depths.has(gid)) return;
            depths.set(gid, d);
            const g = this.#graphs.get(gid);
            if (!g) return;
            g.forEachNode((_, attrs) => {
                const sub = (attrs as PNode).dag;
                if (sub) rec(sub, d + 1);
            });
        };
        rec(this.rootId, 0);
        return depths;
    }

    async walk(visitor: WalkVisitor, opts: WalkOptions = {}): Promise<boolean> {
        const start = opts.startGraphId ?? this.rootId;
        if (!start) return true;
        const depth = this.layerDepths().get(start) ?? 0;
        const concurrency = Math.max(1, opts.concurrency ?? 1);
        const state: WalkState = { stopped: false, errors: [] };
        const sem = new Semaphore(concurrency);

        await this.#walkLayer(start, depth, visitor, opts.filter, concurrency, sem, state);

        if (state.errors.length === 1) throw state.errors[0];
        if (state.errors.length > 1)
            throw new AggregateError(state.errors,
                `[gdag] walk 并行分支 ${state.errors.length} 处失败`);
        return !state.stopped;
    }

    async #walkLayer(
        gid: string, depth: number,
        visitor: WalkVisitor, filter: ((n: PNode) => boolean) | undefined,
        concurrency: number, sem: Semaphore, state: WalkState,
    ): Promise<void> {
        const g = this.#graphs.get(gid);
        if (!g) return;
        const order = topologicalSort(g);

        const runNode = async (nid: string): Promise<void> => {
            if (state.stopped) return;
            const node = g.getNodeAttributes(nid) as PNode;
            if (!filter || filter(node)) {
                await sem.acquire();
                let ctrl: WalkControl;
                try {
                    if (state.stopped) return;
                    ctrl = await visitor({ graphId: gid, depth, node });
                } finally { sem.release(); }
                if (ctrl === 'stop') { state.stopped = true; return; }
                if (ctrl === 'skip') return;
            }
            const fresh = g.getNodeAttributes(nid) as PNode;
            if (fresh.dag)
                await this.#walkLayer(fresh.dag, depth + 1, visitor, filter, concurrency, sem, state);
        };

        if (concurrency <= 1) {
            for (const nid of order) {
                if (state.stopped) return;
                await runNode(nid);
            }
        } else {
            await Promise.all(order.map(nid =>
                runNode(nid).catch(err => {
                    state.errors.push(err);
                    state.stopped = true;
                })
            ));
        }
    }

    // ── 层边界 ──────────────────────────────────────────────────────────────

    initialArtifacts(graphId: string): string[] {
        const g = this.#graphs.get(graphId);
        if (!g) return [];
        const produced = new Set<string>();
        g.forEachNode((_, attrs) => {
            for (const o of (attrs as PNode).outputs) produced.add(o);
        });
        const out = new Set<string>();
        g.forEachNode((_, attrs) => {
            for (const i of (attrs as PNode).inputs)
                if (!produced.has(i)) out.add(i);
        });
        return [...out];
    }

    terminalArtifacts(graphId: string): string[] {
        const g = this.#graphs.get(graphId);
        if (!g) return [];
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

    // ── 展平 ────────────────────────────────────────────────────────────────

    flatten(): string {
        if (!this.rootId) throw new Error(`[gdag] 无根层,无法展平`);
        const flat = flattenGraphs(this.#graphs);
        const id = crypto.randomUUID();
        this.#graphs.set(id, flat);
        return id;
    }

    // ── 持久化 ──────────────────────────────────────────────────────────────

    toJSON(): GDagJSON {
        return {
            rootId: this.rootId,
            graphs: [...this.#graphs.entries()].map(([id, g]) => ({ id, data: g.export() })),
            artifacts: this.#registry.all(),
        };
    }

    static fromJSON(j: GDagJSON): GDag {
        const d = new GDag();
        d.rootId = j.rootId;
        for (const { id, data } of j.graphs) {
            const g = DirectedGraph.from(data);
            g.forEachNode((nid, attrs) => {
                if (!(attrs as PNode).facets) g.setNodeAttribute(nid, 'facets', {});
            });
            d.#graphs.set(id, g);
        }
        d.#registry.load(j.artifacts);
        return d;
    }

    // ── 私有工具 ────────────────────────────────────────────────────────────

    #link(g: DirectedGraph, from: string, to: string, arts: string[]): void {
        if (arts.length === 0) return;
        if (g.hasEdge(from, to)) {
            const prev = g.getEdgeAttribute(from, to, 'artifacts') as string[];
            g.setEdgeAttribute(from, to, 'artifacts', [...new Set([...prev, ...arts])]);
        } else {
            g.addEdge(from, to, { artifacts: [...arts] });
        }
    }
}