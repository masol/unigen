/* eslint-disable svelte/prefer-svelte-reactivity */
// src/lib/flow/store.svelte.ts

import { safeApi } from '$lib/utils/api';
import type {
    GDagJSON,
    NodeStatus,
    PNode,
    RegArtifact
} from '@app/main/types';
import dagre from '@dagrejs/dagre';
import type { Edge as XYEdge, Node as XYNode } from '@xyflow/svelte';
import ELK from 'elkjs/lib/elk.bundled.js';
import DirectedGraph from 'graphology';

export type { GDagJSON, NodeStatus, PNode, RegArtifact };

// ─────────────────────────────────────────────────────────────
//  本地视图类型
// ─────────────────────────────────────────────────────────────

/** 面包屑一层：进入的图 id + 触发进入的节点标签 */
export interface Crumb {
    graphId: string;
    label: string;
    /** 触发下钻的父节点 id（root 层为 null） */
    fromNodeId: string | null;
}

/** 布局策略：elk = 拓扑最干净(默认，含边路由)；dagre = 快而顺眼；simple = 零依赖兜底 */
export type LayoutAlgo = 'elk' | 'dagre' | 'simple';

export const LAYOUT_ALGO_LABEL: Record<LayoutAlgo, string> = {
    elk: 'ELK',
    dagre: 'Dagre',
    simple: '简易'
};

export interface XY {
    x: number;
    y: number;
}

/** 边路由：ELK 规划的折线点（含起终点）+ 标签锚点（折线半程处） */
export interface EdgeRoute {
    points: XY[];
    labelX: number;
    labelY: number;
}

export interface FlowNodeData extends Record<string, unknown> {
    pnode: PNode;
    hasChildren: boolean;
}

export interface FlowEdgeData extends Record<string, unknown> {
    artifact: RegArtifact | null;
    rawName: string;
    /** 非 null = 使用 ELK 规划的折线路径；null = 回退贝塞尔 */
    route: EdgeRoute | null;
}

export type DagFlowNode = XYNode<FlowNodeData>;
export type DagFlowEdge = XYEdge<FlowEdgeData>;

// ─────────────────────────────────────────────────────────────
//  语义标签
// ─────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<NodeStatus, string> = {
    pending: '待处理',
    expanding: '展开中',
    expanded: '已展开',
    awaiting_code: '待编码',
    done: '完成',
    conflict: '冲突'
};

export const STATUS_TONE: Record<
    NodeStatus,
    'primary' | 'muted' | 'destructive' | 'accent'
> = {
    pending: 'muted',
    expanding: 'accent',
    expanded: 'primary',
    awaiting_code: 'accent',
    done: 'primary',
    conflict: 'destructive'
};

export const TRISTATE_LABEL: Record<string, string> = {
    pending: '待定',
    yes: '是',
    no: '否'
};

// ─────────────────────────────────────────────────────────────
//  布局公共常量
// ─────────────────────────────────────────────────────────────

const NODE_W = 260;
const NODE_H = 132;

interface LayoutResult {
    positions: Map<string, XY>;
    /** edgeKey → 路由折线；仅 ELK 产出，其它引擎为空 Map */
    routes: Map<string, EdgeRoute>;
}

// ─────────────────────────────────────────────────────────────
//  引擎 1：简易 Kahn 分层（零依赖兜底）
// ─────────────────────────────────────────────────────────────

const GAP_X = 96;
const GAP_Y = 72;

function layoutSimple(graph: DirectedGraph): LayoutResult {
    const pos = new Map<string, XY>();
    const indeg = new Map<string, number>();
    graph.forEachNode((n) => indeg.set(n, 0));
    graph.forEachDirectedEdge((_e, _a, s, t) => {
        indeg.set(t, (indeg.get(t) ?? 0) + 1);
    });

    const level = new Map<string, number>();
    let frontier = [...indeg.entries()].filter(([, d]) => d === 0).map(([n]) => n);
    if (frontier.length === 0 && graph.order > 0) {
        frontier = graph.nodes(); // 有环兜底
    }
    frontier.forEach((n) => level.set(n, 0));

    const localIndeg = new Map(indeg);
    const queue = [...frontier];
    while (queue.length) {
        const n = queue.shift()!;
        const lv = level.get(n) ?? 0;
        graph.forEachOutNeighbor(n, (m) => {
            const d = (localIndeg.get(m) ?? 0) - 1;
            localIndeg.set(m, d);
            level.set(m, Math.max(level.get(m) ?? 0, lv + 1));
            if (d === 0) queue.push(m);
        });
    }

    const byLevel = new Map<number, string[]>();
    graph.forEachNode((n) => {
        const lv = level.get(n) ?? 0;
        if (!byLevel.has(lv)) byLevel.set(lv, []);
        byLevel.get(lv)!.push(n);
    });

    const maxRows = Math.max(...[...byLevel.values()].map((a) => a.length), 1);
    for (const [lv, nodes] of byLevel.entries()) {
        const offset = ((maxRows - nodes.length) * (NODE_H + GAP_Y)) / 2;
        nodes.forEach((n, i) => {
            pos.set(n, {
                x: lv * (NODE_W + GAP_X),
                y: offset + i * (NODE_H + GAP_Y)
            });
        });
    }
    return { positions: pos, routes: new Map() };
}

// ─────────────────────────────────────────────────────────────
//  引擎 2：dagre（交叉最小化，无边路由）
// ─────────────────────────────────────────────────────────────

function layoutDagre(graph: DirectedGraph): LayoutResult {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
        rankdir: 'LR',
        nodesep: 48,
        ranksep: 110,
        marginx: 24,
        marginy: 24
    });

    graph.forEachNode((n) => g.setNode(n, { width: NODE_W, height: NODE_H }));
    graph.forEachDirectedEdge((_e, _a, s, t) => g.setEdge(s, t));

    dagre.layout(g);

    const pos = new Map<string, XY>();
    graph.forEachNode((n) => {
        const { x, y } = g.node(n);
        pos.set(n, { x: x - NODE_W / 2, y: y - NODE_H / 2 }); // 中心点 → 左上角
    });
    return { positions: pos, routes: new Map() };
}

// ─────────────────────────────────────────────────────────────
//  引擎 3：ELK layered（默认）——「拓扑干净优先」
//  核心：edgeRouting=ORTHOGONAL 强制边走正交折线绕开节点；
//        spacing.edgeNode 保证边与节点的最小间距（防压硬约束）。
// ─────────────────────────────────────────────────────────────

const elk = new ELK();

const ELK_OPTIONS: Record<string, string> = {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    // ── 拓扑干净三件套 ──
    'elk.edgeRouting': 'ORTHOGONAL',                            // 正交折线，绕节点
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP', // 交叉最小化
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',    // 平衡的节点定位
    // ── 间距硬约束（防压核心）──
    'elk.spacing.nodeNode': '56',
    'elk.layered.spacing.nodeNodeBetweenLayers': '120',
    'elk.spacing.edgeNode': '32',   // 边与节点最小间距
    'elk.spacing.edgeEdge': '16',   // 边与边最小间距
    'elk.layered.spacing.edgeNodeBetweenLayers': '32',
    // ── 其它 ──
    'elk.layered.mergeEdges': 'false',
    'elk.portConstraints': 'FIXED_SIDE'
};

interface ElkPoint { x: number; y: number }
interface ElkSection {
    startPoint: ElkPoint;
    endPoint: ElkPoint;
    bendPoints?: ElkPoint[];
}
interface ElkEdgeOut {
    id: string;
    sections?: ElkSection[];
}
interface ElkNodeOut {
    id: string;
    x?: number;
    y?: number;
    children?: ElkNodeOut[];
    edges?: ElkEdgeOut[];
}

/** 折线半程点：作为边标签锚点，比几何中点更贴合折线走向 */
function polylineMidpoint(points: XY[]): XY {
    if (points.length === 0) return { x: 0, y: 0 };
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += Math.hypot(
            points[i].x - points[i - 1].x,
            points[i].y - points[i - 1].y
        );
    }
    let walk = total / 2;
    for (let i = 1; i < points.length; i++) {
        const seg = Math.hypot(
            points[i].x - points[i - 1].x,
            points[i].y - points[i - 1].y
        );
        if (walk <= seg && seg > 0) {
            const t = walk / seg;
            return {
                x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
                y: points[i - 1].y + (points[i].y - points[i - 1].y) * t
            };
        }
        walk -= seg;
    }
    return points[Math.floor(points.length / 2)];
}

async function layoutElk(graph: DirectedGraph): Promise<LayoutResult> {
    const children: { id: string; width: number; height: number }[] = [];
    graph.forEachNode((n) =>
        children.push({ id: n, width: NODE_W, height: NODE_H })
    );

    const elkEdges: { id: string; sources: string[]; targets: string[] }[] = [];
    graph.forEachDirectedEdge((ekey, _a, s, t) => {
        elkEdges.push({
            id: ekey ?? `${s}->${t}`,
            sources: [s],
            targets: [t]
        });
    });

    const out = (await elk.layout({
        id: 'root',
        layoutOptions: ELK_OPTIONS,
        children,
        edges: elkEdges
    })) as ElkNodeOut;

    const positions = new Map<string, XY>();
    for (const c of out.children ?? []) {
        positions.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
    }

    const routes = new Map<string, EdgeRoute>();
    for (const e of out.edges ?? []) {
        const sec = e.sections?.[0];
        if (!sec) continue;
        const points: XY[] = [
            sec.startPoint,
            ...(sec.bendPoints ?? []),
            sec.endPoint
        ].map((p) => ({ x: p.x, y: p.y }));
        const mid = polylineMidpoint(points);
        routes.set(e.id, { points, labelX: mid.x, labelY: mid.y });
    }

    return { positions, routes };
}

// ─────────────────────────────────────────────────────────────
//  Store 主体 —— 全局单例，子组件全部读写它，彼此不直接通信
// ─────────────────────────────────────────────────────────────

export class FlowStore {
    // ── 原始数据 ──
    private raw = $state.raw<GDagJSON | null>(null);
    /** graphId → DirectedGraph 反序列化实例 */
    private graphs = new Map<string, DirectedGraph>();
    /** name/alias → RegArtifact 快查表 */
    private artifactIndex = new Map<string, RegArtifact>();

    // ── 路由参数 ──
    id = $state<string>('');

    // ── 加载态 ──
    loading = $state<boolean>(false);
    lastError = $state<string | null>(null);
    private loadedId: string | null = null;

    // ── 布局 ──
    /** 布局策略配置项：默认 elk（拓扑干净优先） */
    layoutAlgo = $state<LayoutAlgo>('dagre');
    /** ELK 异步计算中（simple/dagre 为同步，不置位） */
    layouting = $state<boolean>(false);
    /** 当前布局结果（ELK 异步产出后写回，触发 nodes/edges 重算） */
    private layout = $state.raw<LayoutResult>({
        positions: new Map(),
        routes: new Map()
    });
    /** 竞态防护：只接受最后一次布局请求的结果 */
    private layoutSeq = 0;

    // ── 导航栈（面包屑）──
    crumbs = $state<Crumb[]>([]);

    // ── 交互态 ──
    selectedNodeId = $state<string | null>(null);

    // ── 视图偏好 ──
    fitTrigger = $state<number>(0);
    miniMap = $state<boolean>(true);

    // ── 派生：当前图 id ──
    currentGraphId = $derived(
        this.crumbs.length > 0 ? this.crumbs[this.crumbs.length - 1].graphId : null
    );

    // ── 派生：当前 xyflow 节点（位置读自 layout 状态）──
    nodes = $derived.by<DagFlowNode[]>(() => {
        void this.raw;
        const gid = this.currentGraphId;
        if (!gid) return [];
        const g = this.graphs.get(gid);
        if (!g) return [];
        const { positions } = this.layout;
        const out: DagFlowNode[] = [];
        g.forEachNode((key, attr) => {
            const pnode = attr as unknown as PNode;
            out.push({
                id: key,
                type: 'dagNode',
                position: positions.get(key) ?? { x: 0, y: 0 },
                data: {
                    pnode: { ...pnode, id: key },
                    hasChildren: !!pnode.dag && this.graphs.has(pnode.dag)
                }
            });
        });
        return out;
    });

    // ── 派生：当前 xyflow 边（路由读自 layout 状态）──
    edges = $derived.by<DagFlowEdge[]>(() => {
        void this.raw;
        const gid = this.currentGraphId;
        if (!gid) return [];
        const g = this.graphs.get(gid);
        if (!g) return [];
        const { routes } = this.layout;
        const out: DagFlowEdge[] = [];
        g.forEachDirectedEdge((ekey, attr, source, target) => {
            const eid = ekey ?? `${source}->${target}`;
            const rawName =
                (attr?.name as string) ?? (attr?.artifact as string) ?? '';
            const artifact = rawName
                ? (this.artifactIndex.get(rawName) ?? null)
                : null;
            out.push({
                id: eid,
                source,
                target,
                type: 'artifact',
                data: { artifact, rawName, route: routes.get(eid) ?? null }
            });
        });
        return out;
    });

    // ── 派生：统计 ──
    nodeCount = $derived(this.nodes.length);
    edgeCount = $derived(this.edges.length);
    conflictCount = $derived(
        this.nodes.filter((n) => n.data.pnode.status === 'conflict').length
    );
    depth = $derived(this.crumbs.length);

    // ── 派生：选中节点 —— 直接取自底层图，避开 nodes 派生的中间态 ──
    selectedNode: PNode | null = $derived.by<PNode | null>(() => {
        void this.raw; // 数据重载时重算
        const id = this.selectedNodeId;
        const gid = this.currentGraphId;
        if (!id || !gid) return null;
        const g = this.graphs.get(gid);
        if (!g || !g.hasNode(id)) return null;
        const pnode = g.getNodeAttributes(id) as unknown as PNode;
        // 深拷贝关键数组字段并补默认值，交付给 UI 的对象永远字段完整
        return {
            ...pnode,
            id,
            inputs: pnode.inputs ?? [],
            outputs: pnode.outputs ?? [],
            facets: pnode.facets ?? {}
        };
    });
    // ─────────────────────────────────────────────────────────
    //  布局调度：图/策略变化后调用；ELK 异步 + 失败降级
    // ─────────────────────────────────────────────────────────

    private async runLayout() {
        const gid = this.currentGraphId;
        if (!gid) return;
        const g = this.graphs.get(gid);
        if (!g) return;

        const seq = ++this.layoutSeq;

        if (this.layoutAlgo === 'simple') {
            this.layout = layoutSimple(g);
            this.requestFit();
            return;
        }
        if (this.layoutAlgo === 'dagre') {
            this.layout = layoutDagre(g);
            this.requestFit();
            return;
        }

        // elk：异步；期间先给同步兜底布局避免堆叠原点
        this.layout = layoutSimple(g);
        this.layouting = true;
        try {
            const result = await layoutElk(g);
            if (seq !== this.layoutSeq) return; // 有更新的请求，丢弃
            this.layout = result;
            // 让本次 layout 变更先被渲染链消化，再触发 fit，避开渲染撞车
            queueMicrotask(() => {
                if (seq === this.layoutSeq) this.requestFit();
            });
        } catch (e) {
            if (seq !== this.layoutSeq) return;
            console.warn('[flow] ELK layout failed, fallback to dagre:', e);
            try {
                this.layout = layoutDagre(g);
            } catch {
                this.layout = layoutSimple(g);
            }
            this.requestFit();
        } finally {
            if (seq === this.layoutSeq) this.layouting = false;
        }
    }

    /** 切换布局策略（配置项入口） */
    setLayoutAlgo(algo: LayoutAlgo) {
        if (this.layoutAlgo === algo) return;
        this.layoutAlgo = algo;
        void this.runLayout();
    }

    /** 重新自动布局：丢弃用户拖拽位置，按当前策略重排 */
    relayout() {
        void this.runLayout();
    }

    // ─────────────────────────────────────────────────────────
    //  初始化 / 加载
    // ─────────────────────────────────────────────────────────

    async init(id: string) {
        const trimmed = (id ?? '').trim();
        if (this.loadedId === trimmed && !this.loading && this.raw) {
            return; // 指纹一致，复用内存数据
        }
        this.id = trimmed;
        await this.load();
    }

    private async load() {
        this.loading = true;
        this.lastError = null;
        try {
            const origData = await safeApi().project.get(`.${this.id}_state`);
            const data = origData.gdag;

            // 反序列化图
            this.graphs.clear();
            for (const { id, data: sg } of data.graphs) {
                const g = new DirectedGraph();
                g.import(sg);
                this.graphs.set(id, g);
            }

            // artifact 索引（正式名 + 别名）
            this.artifactIndex.clear();
            for (const a of data.artifacts) {
                this.artifactIndex.set(a.name, a);
                for (const al of a.aliases) this.artifactIndex.set(al, a);
            }

            this.selectedNodeId = null;

            const rootGid = this.resolveRootGraphId(data);
            this.crumbs = rootGid
                ? [{ graphId: rootGid, label: '根图', fromNodeId: null }]
                : [];

            this.raw = data; // 触发派生重算
            this.loadedId = this.id;
            await this.runLayout();
        } catch (e) {
            this.lastError = e instanceof Error ? e.message : String(e);
        } finally {
            this.loading = false;
        }
    }

    /** rootId 是节点 id：找到包含该节点的图；找不到则退回第一张图 */
    private resolveRootGraphId(data: GDagJSON): string | null {
        if (data.graphs.length === 0) return null;
        if (data.rootId) {
            for (const [gid, g] of this.graphs.entries()) {
                if (g.hasNode(data.rootId)) return gid;
            }
        }
        return data.graphs[0].id;
    }

    // ─────────────────────────────────────────────────────────
    //  导航：下钻 / 回退 / 跳转 —— 换层后必须重跑布局
    // ─────────────────────────────────────────────────────────

    /** 双击节点：进入其子图 */
    drillInto(nodeId: string) {
        const gid = this.currentGraphId;
        if (!gid) return;
        const g = this.graphs.get(gid);
        if (!g || !g.hasNode(nodeId)) return;
        const pnode = g.getNodeAttributes(nodeId) as unknown as PNode;
        if (!pnode.dag || !this.graphs.has(pnode.dag)) return;

        this.crumbs = [
            ...this.crumbs,
            { graphId: pnode.dag, label: pnode.name || nodeId, fromNodeId: nodeId }
        ];
        this.selectedNodeId = null;
        void this.runLayout();
    }

    /** 面包屑跳转到第 index 层（0 = root） */
    goToCrumb(index: number) {
        if (index < 0 || index >= this.crumbs.length) return;
        if (index === this.crumbs.length - 1) return;
        this.crumbs = this.crumbs.slice(0, index + 1);
        this.selectedNodeId = null;
        void this.runLayout();
    }

    goUp() {
        if (this.crumbs.length <= 1) return;
        this.goToCrumb(this.crumbs.length - 2);
    }

    // ─────────────────────────────────────────────────────────
    //  交互回写
    // ─────────────────────────────────────────────────────────

    selectNode(id: string | null) {
        this.selectedNodeId = id;
    }
    requestFit() {
        this.fitTrigger++;
    }
    toggleMiniMap() {
        this.miniMap = !this.miniMap;
    }

    /** 强制刷新：忽略指纹缓存重新拉取；尽力保留当前下钻路径 */
    async refresh() {
        if (this.loading) return;
        const prevCrumbs = this.crumbs;
        this.loadedId = null;
        await this.load(); // load 会把 crumbs 重置到根图
        const restored: Crumb[] = [];
        for (const c of prevCrumbs) {
            if (this.graphs.has(c.graphId)) restored.push(c);
            else break;
        }
        if (restored.length > 0) {
            this.crumbs = restored;
            await this.runLayout();
        }
    }
}

/** ── 全局唯一实例：所有子组件共用 ── */
export const flowStore = new FlowStore();