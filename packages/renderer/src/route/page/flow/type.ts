import {
    IconAdjustmentsCog,
    IconArrowMerge,
    IconArrowsJoin2,
    IconBlockquote,
    IconCategory,
    IconCut,
    IconFileZip,
    IconFilter,
    IconGavel,
    IconMap2,
    IconRoute,
    IconSearch,
    IconShieldCheck,
    IconSparkles,
    IconStar,
    IconSum,
    IconTransform
} from '@tabler/icons-svelte';
import type { Edge as XYEdge, Node as XYNode } from '@xyflow/svelte';

import type {
    GuardKind,
    NodeKindT,
    NodeStatus,
    PNode,
    RegArtifact,
    RiskLevel,
    SizeEstimateT
} from '@app/main/types';
import dagre from '@dagrejs/dagre';
import type { DirectedGraph } from 'graphology';

// ─────────────────────────────────────────────────────────────
//  运行模式：同一份 store，两种宿主（整页 / 底部面板）
// ─────────────────────────────────────────────────────────────

export type FlowMode = 'page' | 'panel';

// ─────────────────────────────────────────────────────────────
//  本地视图类型
// ─────────────────────────────────────────────────────────────

export interface Crumb {
    graphId: string;
    label: string;
    fromNodeId: string | null;
}

export interface XY {
    x: number;
    y: number;
}

export type MapMode = 'concurrent' | 'sequential' | null;

export interface FlowNodeData extends Record<string, unknown> {
    pnode: PNode;
    hasChildren: boolean;
    mapMode: MapMode;
    arrayIn: boolean;
    arrayOut: boolean;
}

export interface FlowEdgeData extends Record<string, unknown> {
    artifact: RegArtifact | null;
    rawName: string;
}

export type DagFlowNode = XYNode<FlowNodeData>;
export type DagFlowEdge = XYEdge<FlowEdgeData>;

export type ArtifactRole = 'input' | 'output';

export interface SelectedArtifact {
    name: string;
    role: ArtifactRole;
    artifact: RegArtifact | null;
    producers: { id: string; name: string }[];
    consumers: { id: string; name: string }[];
}

export interface ResolvedIo {
    name: string;
    artifact: RegArtifact | null;
}

/**
 * 纯输入交付物：全 DAG 树（含递归子图）范围内，
 * 「有节点消费、无任何节点生产」的产物。
 * 是整套流程真正需要外部录入数据的入口。
 */
export interface PureInputArtifact {
    /** 图内出现的原始名（可能是别名） */
    name: string;
    /** 归一后的规范名（若在注册表内） */
    canonicalName: string;
    /** 注册表中的完整产物定义，未登记则为 null */
    artifact: RegArtifact | null;
    /** 是否数组产物（需录入多条同构数据） */
    isArray: boolean;
    /** 尺寸估计（未登记则为 null） */
    sizeEstimate: SizeEstimateT | null;
    /** 消费此产物的节点（跨所有层级） */
    consumers: { graphId: string; nodeId: string; nodeName: string }[];
}

// ─────────────────────────────────────────────────────────────
//  语义标签与视觉映射
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

export const KIND_LABEL: Record<NodeKindT, string> = {
    extract: '提取',
    classify: '分类',
    summarize: '摘要',
    transform: '转换',
    merge: '合并',
    score: '评分',
    generate: '生成',
    lookup: '查询',
    aggregate: '聚合',
    route: '路由',
    split: '拆分',
    map: '映射',
    reduce: '归约',
    validate: '校验',
    critique: '评审',
    compress: '压缩',
    plan: "规划"
};

export const KIND_ICON: Record<NodeKindT, typeof IconFilter> = {
    extract: IconFilter,
    classify: IconCategory,
    summarize: IconBlockquote,
    transform: IconTransform,
    merge: IconArrowsJoin2,
    score: IconStar,
    generate: IconSparkles,
    lookup: IconSearch,
    aggregate: IconSum,
    route: IconRoute,
    split: IconCut,
    map: IconMap2,
    reduce: IconArrowMerge,
    validate: IconShieldCheck,
    critique: IconGavel,
    compress: IconFileZip,
    plan: IconAdjustmentsCog
};

export const RISK_LABEL: Record<RiskLevel, string> = {
    low: '低风险',
    medium: '中风险',
    high: '高风险'
};

export const GUARD_KIND_LABEL: Record<GuardKind, string> = {
    validate: '校验',
    critique: '评审'
};

export const SIZE_LABEL: Record<SizeEstimateT, string> = {
    small: '小型',
    medium: '中型',
    large: '大型',
    unbounded: '无界'
};

export const SIZE_DESC: Record<SizeEstimateT, string> = {
    small: '<1K',
    medium: '1K–10K',
    large: '10K–600K',
    unbounded: '>600K'
};

export const MAP_MODE_LABEL: Record<'concurrent' | 'sequential', string> = {
    concurrent: '并发映射',
    sequential: '顺序映射'
};

export const MAP_MODE_DESC: Record<'concurrent' | 'sequential', string> = {
    concurrent: '对数组产物逐条并发执行同一思维操作，条间互不依赖',
    sequential: '对数组产物逐条顺序执行，前条结果可影响后条'
};

// ─────────────────────────────────────────────────────────────
//  布局公共常量
// ─────────────────────────────────────────────────────────────

const NODE_W = 260;
const NODE_H = 156;

// ─────────────────────────────────────────────────────────────
//  唯一布局引擎：dagre
// ─────────────────────────────────────────────────────────────

export function layoutDagre(graph: DirectedGraph): Map<string, XY> {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
        rankdir: 'LR',
        nodesep: 56,
        ranksep: 120,
        marginx: 24,
        marginy: 24
    });

    graph.forEachNode((n) => g.setNode(n, { width: NODE_W, height: NODE_H }));
    graph.forEachDirectedEdge((_e, _a, s, t) => g.setEdge(s, t));

    dagre.layout(g);

    const pos = new Map<string, XY>();
    graph.forEachNode((n) => {
        const { x, y } = g.node(n);
        pos.set(n, { x: x - NODE_W / 2, y: y - NODE_H / 2 });
    });
    return pos;
}
