/**
 * ============================================================================
 * 【P-graph · GDag:DirectedGraph 数组 + 根 id + 产物注册表(门面)】
 * ============================================================================
 */
import type { IRunnerContext } from '$types/blueprint/context.js';
import {
    Artifact,
    GDagJSON, IndexMeta, Io, PNode, RegArtifact, TriState,
} from "$types/shared/plan/nodes.js";
import Logger from "electron-log/main.js";
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

export function isExecutable(n: PNode): boolean {
    return getFacet(n, FacetNames.simple) === 'yes'
        || getFacet(n, FacetNames.codeable) === 'yes'
        || getFacet(n, FacetNames.lib) === 'yes';
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

    // ── 图管理 ──────────────────────────────────────────────────────────────

    createLayer(nodes: PNode[], asRoot = false): string {
        const g = new DirectedGraph();
        const producer = new Map<string, string>();
        for (const n of nodes) {
            g.addNode(n.id, { ...n });
            for (const o of n.outputs) producer.set(o.name, n.id);
        }
        for (const n of nodes) {
            for (const i of n.inputs) {
                const from = producer.get(i.name);
                if (!from || from === n.id) continue;
                this.#link(g, from, n.id, [i.name]);
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
        const taken = new Set(self.inputs.map(i => i.name));
        const pool = new Map<string, Io>();
        const add = (io: Io): void => {
            if (!taken.has(io.name) && !pool.has(io.name)) pool.set(io.name, io);
        };

        for (const aid of ancestors) {
            const a = g.getNodeAttributes(aid) as PNode;
            for (const o of a.outputs) add(o);
        }
        const produced = new Set<string>();
        g.forEachNode((_, attrs) => {
            for (const o of (attrs as PNode).outputs) produced.add(o.name);
        });
        g.forEachNode((_, attrs) => {
            for (const i of (attrs as PNode).inputs)
                if (!produced.has(i.name)) add(i);
        });
        return [...pool.values()];
    }

    addNodeInputs(graphId: string, nodeId: string, extra: Io[]): void {
        if (extra.length === 0) return;
        const g = this.#graphs.get(graphId);
        if (!g || !g.hasNode(nodeId)) throw new Error(`[gdag] 节点不存在:${nodeId}`);
        const node = g.getNodeAttributes(nodeId) as PNode;
        const have = new Set(node.inputs.map(i => i.name));
        const added = extra.filter(io => !have.has(io.name));
        if (added.length === 0) return;
        g.setNodeAttribute(nodeId, 'inputs', [...node.inputs, ...added]);

        const producer = new Map<string, string>();
        g.forEachNode((nid, attrs) => {
            for (const o of (attrs as PNode).outputs) producer.set(o.name, nid);
        });
        for (const io of added) {
            const from = producer.get(io.name);
            if (!from || from === nodeId) continue;
            this.#link(g, from, nodeId, [io.name]);
        }
    }

    // ── 物理规划:图改写方法 ─────────────────────────────────────────────────

    /** 找某层中消费特定 artifact 的所有节点 */
    findConsumers(graphId: string, artifactName: string): PNode[] {
        const g = this.#graphs.get(graphId);
        if (!g) return [];
        const out: PNode[] = [];
        g.forEachNode((_, attrs) => {
            const n = attrs as PNode;
            if (n.inputs.some(i => i.name === artifactName)) out.push(n);
        });
        return out;
    }

    /** 替换节点的某个输出 artifact(名称 + 元信息),并更新出边 */
    replaceNodeOutput(graphId: string, nodeId: string, oldName: string, newArt: Artifact): void {
        const g = this.#graphs.get(graphId);
        if (!g || !g.hasNode(nodeId)) throw new Error(`[gdag] 节点不存在:${nodeId}`);
        const node = g.getNodeAttributes(nodeId) as PNode;
        const newOutputs = node.outputs.map(o => o.name === oldName ? newArt : o);
        g.setNodeAttribute(nodeId, 'outputs', newOutputs);

        // 更新出边:oldName → newArt.name
        for (const eid of g.outEdges(nodeId)) {
            const arts = g.getEdgeAttribute(eid, 'artifacts') as string[];
            const updated = arts.map(a => a === oldName ? newArt.name : a);
            g.setEdgeAttribute(eid, 'artifacts', updated);
        }
    }

    /** 替换节点的某个输入 artifact(名称 + 元信息),并更新入边 */
    replaceNodeInput(graphId: string, nodeId: string, oldName: string, newArt: Artifact): void {
        const g = this.#graphs.get(graphId);
        if (!g || !g.hasNode(nodeId)) throw new Error(`[gdag] 节点不存在:${nodeId}`);
        const node = g.getNodeAttributes(nodeId) as PNode;
        const newInputs = node.inputs.map(i => i.name === oldName ? newArt : i);
        g.setNodeAttribute(nodeId, 'inputs', newInputs);

        // 更新入边
        for (const eid of g.inEdges(nodeId)) {
            const arts = g.getEdgeAttribute(eid, 'artifacts') as string[];
            const updated = arts.map(a => a === oldName ? newArt.name : a);
            g.setEdgeAttribute(eid, 'artifacts', updated);
        }

        // 如果 newArt 有新的 producer,加边
        const producer = this.#findProducer(g, newArt.name);
        if (producer && producer !== nodeId && !g.hasEdge(producer, nodeId)) {
            g.addEdge(producer, nodeId, { artifacts: [newArt.name] });
        }
    }

    /** 在 fromNode 和 toNode 之间插入一个新节点 */
    insertNodeBetween(graphId: string, fromNodeId: string, toNodeId: string, inject: PNode): void {
        const g = this.#graphs.get(graphId);
        if (!g) throw new Error(`[gdag] 层不存在:${graphId}`);

        g.addNode(inject.id, inject);

        // from → inject 边(inject 消费 from 的输出)
        for (const inp of inject.inputs) {
            const from = this.#findProducer(g, inp.name);
            if (from) this.#link(g, from, inject.id, [inp.name]);
        }

        // inject → to 边(to 消费 inject 的输出)
        for (const out of inject.outputs) {
            this.#link(g, inject.id, toNodeId, [out.name]);
        }

        // 清理 from → to 的直连边中被截断的 artifact
        if (g.hasEdge(fromNodeId, toNodeId)) {
            const arts = g.getEdgeAttribute(fromNodeId, toNodeId, 'artifacts') as string[];
            const intercepted = inject.inputs.map(i => i.name);
            const remaining = arts.filter(a => !intercepted.includes(a));
            if (remaining.length === 0) {
                g.dropEdge(fromNodeId, toNodeId);
            } else {
                g.setEdgeAttribute(fromNodeId, toNodeId, 'artifacts', remaining);
            }
        }
    }

    /** 在图末尾追加一个终端节点(消费某 artifact,产出最终版) */
    appendTerminalNode(graphId: string, node: PNode): void {
        const g = this.#graphs.get(graphId);
        if (!g) throw new Error(`[gdag] 层不存在:${graphId}`);

        g.addNode(node.id, node);
        for (const inp of node.inputs) {
            const from = this.#findProducer(g, inp.name);
            if (from) this.#link(g, from, node.id, [inp.name]);
        }
    }

    /** 在目标节点之前插入一个节点(接管目标的部分入边) */
    injectBeforeNode(graphId: string, targetNodeId: string, inject: PNode): void {
        const g = this.#graphs.get(graphId);
        if (!g || !g.hasNode(targetNodeId))
            throw new Error(`[gdag] 节点不存在:${targetNodeId}`);

        g.addNode(inject.id, inject);

        // inject 的输入:从上游(现有 producer)拉边
        for (const inp of inject.inputs) {
            const from = this.#findProducer(g, inp.name);
            if (from) this.#link(g, from, inject.id, [inp.name]);
        }

        // inject 的输出:连到 target
        for (const out of inject.outputs) {
            this.#link(g, inject.id, targetNodeId, [out.name]);
            // 若 target 还没有这个 input,加上
            const target = g.getNodeAttributes(targetNodeId) as PNode;
            if (!target.inputs.some(i => i.name === out.name)) {
                g.setNodeAttribute(targetNodeId, 'inputs', [...target.inputs, out]);
            }
        }

        Logger.debug(`[gdag] 前置注入:${inject.name} → ${(g.getNodeAttributes(targetNodeId) as PNode).name}`);
    }

    /** 在某节点的上游查找最近的 IndexMeta */
    findUpstreamIndexMeta(graphId: string, nodeId: string): IndexMeta | null {
        const g = this.#graphs.get(graphId);
        if (!g || !g.hasNode(nodeId)) return null;
        const visited = new Set<string>();
        const queue: string[] = [];
        g.forEachInNeighbor(nodeId, (nb) => queue.push(nb));
        while (queue.length > 0) {
            const cur = queue.shift()!;
            if (visited.has(cur)) continue;
            visited.add(cur);
            const attrs = g.getNodeAttributes(cur) as PNode;
            if (attrs.indexMeta) return attrs.indexMeta;
            g.forEachInNeighbor(cur, (nb) => queue.push(nb));
        }
        return null;
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
            for (const o of (attrs as PNode).outputs) produced.add(o.name);
        });
        const out = new Set<string>();
        g.forEachNode((_, attrs) => {
            for (const i of (attrs as PNode).inputs)
                if (!produced.has(i.name)) out.add(i.name);
        });
        return [...out];
    }

    terminalArtifacts(graphId: string): string[] {
        const g = this.#graphs.get(graphId);
        if (!g) return [];
        const consumed = new Set<string>();
        g.forEachNode((_, attrs) => {
            for (const i of (attrs as PNode).inputs) consumed.add(i.name);
        });
        const out: string[] = [];
        g.forEachNode((_, attrs) => {
            for (const o of (attrs as PNode).outputs)
                if (!consumed.has(o.name)) out.push(o.name);
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

    #findProducer(g: DirectedGraph, artifactName: string): string | null {
        let producer: string | null = null;
        g.forEachNode((nid, attrs) => {
            const n = attrs as PNode;
            if (n.outputs.some(o => o.name === artifactName)) producer = nid;
        });
        return producer;
    }
}