/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 物理规划共享扫描工具
 */
import { PNode, SizeEstimateT } from "$types/shared/plan/nodes.js";
import { PHYSICAL_SPLIT_SIZES } from "../../config.js";
import { PlanContext } from "../../context.js";
import { FacetNames, getFacet, NodeStatusValue } from "../../graph/gdag.js";

export interface NodeSizeInfo {
    node: PNode;
    graphId: string;
    outputSize: SizeEstimateT;
    hasLargeInput: boolean;
    /** 输入中规模最大的那份大数据的名称 */
    largestInputName: string | null;
}

export function scanLeaves(pctx: PlanContext): NodeSizeInfo[] {
    const gdag = pctx.gdag;
    const out: NodeSizeInfo[] = [];
    for (const { graphId, node } of gdag.scan(NodeStatusValue.awaiting_code)) {
        const outputSize = (node.outputs
            .map(o => gdag.getArtifact(o.name)?.sizeEstimate ?? 'small')[0] ?? 'small') as SizeEstimateT;
        let largestInputName: string | null = null;
        let hasLargeInput = false;
        for (const i of node.inputs) {
            const sz = gdag.getArtifact(i.name)?.sizeEstimate ?? 'small';
            if (PHYSICAL_SPLIT_SIZES.includes(sz as any)) {
                hasLargeInput = true;
                largestInputName = i.name;
            }
        }
        out.push({ node, graphId, outputSize, hasLargeInput, largestInputName });
    }
    return out;
}

export function isLargeSize(sz: string): boolean {
    return PHYSICAL_SPLIT_SIZES.includes(sz as any);
}

export function isDeterministic(node: PNode): boolean {
    return getFacet(node, FacetNames.codeable) === 'yes';
}