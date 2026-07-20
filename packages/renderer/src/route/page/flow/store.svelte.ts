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

export interface XY {
    x: number;
    y: number;
}

export interface FlowNodeData extends Record<string, unknown> {
    pnode: PNode;
    hasChildren: boolean;
}

export interface FlowEdgeData extends Record<string, unknown> {
    artifact: RegArtifact | null;
    rawName: string;
}

export type DagFlowNode = XYNode<FlowNodeData>;
export type DagFlowEdge = XYEdge<FlowEdgeData>;

/** 选中产物的来源方向，用于面板标注「作为 X 的输入/输出」 */
export type ArtifactRole = 'input' | 'output';

/** 选中产物的视图模型：注册信息 + 相对当前节点的角色 */
export interface SelectedArtifact {
    name: string;
    role: ArtifactRole;
    /** artifacts 注册表命中项；未登记为 null */
    artifact: RegArtifact | null;
    /** 该产物的所有生产者节点（在当前图中） */
    producers: { id: string; name: string }[];
    /** 该产物的所有消费者节点（在当前图中） */
    consumers: { id: string; name: string }[];
}

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

// ─────────────────────────────────────────────────────────────
//  唯一布局引擎：dagre（交叉最小化）
// ─────────────────────────────────────────────────────────────

function layoutDagre(graph: DirectedGraph): Map<string, XY> {
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
    return pos;
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

    // ── 布局结果（dagre 同步产出） ──
    private positions = $state.raw<Map<string, XY>>(new Map());

    // ── 导航栈（面包屑）──
    crumbs = $state<Crumb[]>([]);

    // ── 交互态 ──
    selectedNodeId = $state<string | null>(null);
    /** 当前在详情面板查看的产物名（点击 IO Badge 触发） */
    selectedArtifactName = $state<string | null>(null);
    /** 记录点击来源角色，用于面板文案 */
    selectedArtifactRole = $state<ArtifactRole>('output');

    // ── 视图偏好 ──
    fitTrigger = $state<number>(0);
    miniMap = $state<boolean>(true);

    // ── 派生：当前图 id ──
    currentGraphId = $derived(
        this.crumbs.length > 0 ? this.crumbs[this.crumbs.length - 1].graphId : null
    );

    // ── 派生：当前 xyflow 节点（位置读自 positions 状态）──
    nodes = $derived.by<DagFlowNode[]>(() => {
        void this.raw;
        const gid = this.currentGraphId;
        if (!gid) return [];
        const g = this.graphs.get(gid);
        if (!g) return [];
        const positions = this.positions;
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

    // ── 派生：当前 xyflow 边 ──
    edges = $derived.by<DagFlowEdge[]>(() => {
        void this.raw;
        const gid = this.currentGraphId;
        if (!gid) return [];
        const g = this.graphs.get(gid);
        if (!g) return [];
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
                data: { artifact, rawName }
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

    // ── 派生：当前查看的产物详情（点击 IO 触发）──
    selectedArtifact: SelectedArtifact | null = $derived.by<SelectedArtifact | null>(
        () => {
            void this.raw;
            const name = this.selectedArtifactName;
            const gid = this.currentGraphId;
            if (!name || !gid) return null;
            const g = this.graphs.get(gid);
            if (!g) return null;

            const artifact = this.artifactIndex.get(name) ?? null;
            const producers: { id: string; name: string }[] = [];
            const consumers: { id: string; name: string }[] = [];

            // 在当前图内扫描：谁产出（output）此产物、谁消费（input）此产物
            g.forEachNode((key, attr) => {
                const pn = attr as unknown as PNode;
                const outs = pn.outputs ?? [];
                const ins = pn.inputs ?? [];
                const matchName = (io: { name: string }) => {
                    if (io.name === name) return true;
                    // 别名归一：产物注册名或其别名命中
                    const reg = this.artifactIndex.get(io.name);
                    return reg?.name === (artifact?.name ?? name);
                };
                if (outs.some(matchName))
                    producers.push({ id: key, name: pn.name || key });
                if (ins.some(matchName))
                    consumers.push({ id: key, name: pn.name || key });
            });

            return {
                name,
                role: this.selectedArtifactRole,
                artifact,
                producers,
                consumers
            };
        }
    );

    // ─────────────────────────────────────────────────────────
    //  布局调度：图变化后调用（dagre 同步）
    // ─────────────────────────────────────────────────────────

    private runLayout() {
        const gid = this.currentGraphId;
        if (!gid) return;
        const g = this.graphs.get(gid);
        if (!g) return;
        this.positions = layoutDagre(g);
        this.requestFit();
    }

    /** 重新自动布局：丢弃用户拖拽位置，按 dagre 重排 */
    relayout() {
        this.runLayout();
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
            this.selectedArtifactName = null;

            const rootGid = this.resolveRootGraphId(data);
            this.crumbs = rootGid
                ? [{ graphId: rootGid, label: '根图', fromNodeId: null }]
                : [];

            this.raw = data; // 触发派生重算
            this.loadedId = this.id;
            this.runLayout();
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
        this.selectedArtifactName = null;
        this.runLayout();
    }

    /** 面包屑跳转到第 index 层（0 = root） */
    goToCrumb(index: number) {
        if (index < 0 || index >= this.crumbs.length) return;
        if (index === this.crumbs.length - 1) return;
        this.crumbs = this.crumbs.slice(0, index + 1);
        this.selectedNodeId = null;
        this.selectedArtifactName = null;
        this.runLayout();
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
        // 切换节点时清空产物详情，避免遗留错位
        this.selectedArtifactName = null;
    }

    /** 点击 IO Badge：在详情面板打开某产物；再次点击同名则关闭 */
    selectArtifact(name: string | null, role: ArtifactRole = 'output') {
        if (name && this.selectedArtifactName === name) {
            this.selectedArtifactName = null;
            return;
        }
        this.selectedArtifactName = name;
        this.selectedArtifactRole = role;
    }

    /** 定位并选中某节点（供产物面板的生产者/消费者跳转） */
    focusNode(id: string) {
        const gid = this.currentGraphId;
        if (!gid) return;
        const g = this.graphs.get(gid);
        if (!g || !g.hasNode(id)) return;
        this.selectedNodeId = id;
        this.requestFit();
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
            this.runLayout();
        }
    }
}

/** ── 全局唯一实例：所有子组件共用 ── */
export const flowStore = new FlowStore();