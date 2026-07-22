import type { NewMetagRow } from '$libs/blueprint/metag/is.js';
import { PrjDB } from '$libs/project/controllers/drizzle/index.js';
import type { NewCapability } from '$types/blueprint/capability.js';
import type { PNode, RegArtifact } from '$types/shared/plan/nodes.js';
import Logger from 'electron-log';
import { ZodType } from 'zod';
import { GeneratedArtifact, PlanContext } from '../../context.js';
import type { GDag } from '../../graph/gdag.js';

/**
 * 落盘单个代码产物（#code 能力 + 其直接关联的 metag）。
 *
 * 仅负责当前节点：
 *   1. 以节点信息 + art.code 构造 #code 能力并 upcert。
 *   2. 遍历该节点的 inputs/outputs，更新对应 metag。
 *
 * 注意：本函数不落盘任何 DAG 结构（#workflow），DAG 结构由 persistDag 统一处理。
 */
export function persistArtifact(art: GeneratedArtifact, pctx: PlanContext): void {
    // 内存缓存，供 flatten / 后续阶段读取
    pctx.setGeneratedCode(art.nodeId, art);

    const prjdb = PrjDB.ensure(pctx.ctx.prj);
    const gdag = pctx.gdag;

    const hit = gdag.findNode(art.nodeId);
    if (!hit) {
        Logger.warn(`[codegen] 落盘失败：GDag 中找不到节点「${art.nodeId}」`);
        return;
    }
    const node = hit.node;

    // ── 1. 落盘 #code 能力 ────────────────────────────────────────
    const codeCapa = buildCapaFromNode(node, '#code', art.code, {
        input: node.inputs,
        output: node.outputs,
    });
    const codeCapaId = prjdb.upcertCapa(codeCapa);

    // ── 2. 落盘本节点直接关联的 metag ─────────────────────────────
    const visitedMetags = new Set<string>();
    for (const name of [...node.inputs, ...node.outputs]) {
        upsertMetagForArtifact(gdag, prjdb, name, visitedMetags);
    }

    // ── 3. 落盘本节点直接关联的 提示词资源 ─────────────────────────────

    // pctx.prjdb.set(`.${art.nodeId}_code`, art.code);
    art.prompts.forEach((p, i) => {
        const step = i + 1;
        pctx.prjdb.set(`_${art.nodeId}_step${step}_system`, p.system);
        pctx.prjdb.set(`_${art.nodeId}_step${step}_user`, p.user);
    });

    Logger.debug(
        `[codegen] #code 落盘 id=${codeCapaId} node=${art.nodeId} ` +
        `code=${art.code.length}c prompts=${art.prompts.length} metags=${visitedMetags.size}`
    );
}

/**
 * 落盘整棵 DAG 结构。
 *
 * 顺着 GDag 从根层开始，每一层 DAG 展开为一个 #workflow 能力（code 保存本层 DAG 的 JSON），
 * 并遍历全部节点的 inputs/outputs 更新 metag。对含子 DAG 的节点递归下钻。
 */
export function persistDag(pctx: PlanContext): void {
    const prjdb = PrjDB.ensure(pctx.ctx.prj);
    const gdag = pctx.gdag;

    if (!gdag.rootId) {
        Logger.warn(`[codegen] persistDag：GDag 无根层，跳过`);
        return;
    }

    const visitedGraphs = new Set<string>();
    const visitedMetags = new Set<string>();

    // 根层无父节点 → repNode = undefined。
    persistLayerRecursive(gdag, prjdb, gdag.rootId, undefined, visitedGraphs, visitedMetags);

    Logger.debug(
        `[codegen] persistDag 完成 workflows=${visitedGraphs.size} metags=${visitedMetags.size}`
    );
}

/**
 * 递归处理一层 DAG：
 *   - 将本层 DAG 展开为一个 #workflow 能力（空图跳过）。
 *     其语义（role/goal）来自展开出本层的父节点 parentNode；根层无父节点。
 *   - 遍历本层节点的输入/输出，更新 metag。
 *   - 对每个含子 DAG 的节点，以该节点为父节点递归处理其子层。
 */
function persistLayerRecursive(
    gdag: GDag,
    prjdb: PrjDB,
    graphId: string,
    parentNode: PNode | undefined,
    visitedGraphs: Set<string>,
    visitedMetags: Set<string>,
): void {
    if (visitedGraphs.has(graphId)) return;
    visitedGraphs.add(graphId);

    const g = gdag.getGraph(graphId);
    if (!g) {
        Logger.warn(`[codegen] persistLayer：找不到图 ${graphId}`);
        return;
    }

    const nodes = gdag.topoNodes(graphId);

    // 空图不产生 #workflow 能力，直接返回。
    if (nodes.length === 0) {
        Logger.warn(`[codegen] persistLayer：图 ${graphId} 为空，跳过 #workflow`);
        return;
    }

    // ── 展开本层为 #workflow 能力，code 保存本层 DAG 的 JSON ─────────
    const layerJson = JSON.stringify(g.export(), null, 2);
    const layerInputs = gdag.initialArtifacts(graphId);
    const layerOutputs = gdag.terminalArtifacts(graphId);

    const workflowCapa = buildWorkflowCapa(
        graphId,
        parentNode,
        layerJson,
        layerInputs,
        layerOutputs,
    );
    const wfId = prjdb.upcertCapa(workflowCapa);
    Logger.debug(`[codegen] #workflow 落盘 id=${wfId} graph=${graphId}`);

    // ── 更新本层所有节点的 metag ──────────────────────────────────
    for (const n of nodes) {
        for (const name of [...n.inputs, ...n.outputs]) {
            upsertMetagForArtifact(gdag, prjdb, name, visitedMetags);
        }
    }

    // ── 递归处理子 DAG（以该节点为父节点） ────────────────────────
    for (const n of nodes) {
        if (n.dag) {
            persistLayerRecursive(gdag, prjdb, n.dag, n, visitedGraphs, visitedMetags);
        }
    }
}


/**
 * 依据 artifact 名，从 GDag 的产物注册表取出 RegArtifact，转换为 metag 落盘。
 * 通过 canonical 名去重，避免重复写入。
 */
function upsertMetagForArtifact(
    gdag: GDag,
    prjdb: PrjDB,
    artifactName: string,
    visitedMetags: Set<string>,
): void {
    const canonical = gdag.resolveName(artifactName) ?? artifactName;
    if (visitedMetags.has(canonical)) return;

    const reg: RegArtifact | null = gdag.getArtifact(canonical);
    if (!reg) {
        // 注册表中没有该产物的完整定义，无法构造 metag，跳过。
        return;
    }
    visitedMetags.add(canonical);

    const metag: NewMetagRow = {
        fieldKey: canonical,
        intent: reg.intent ?? null,
        dims: reg.qualityCriteria ?? [],
        schema: reg.dataSchema ? (reg.dataSchema as ZodType) : null,
    };

    prjdb.upcertMetag(metag);
    Logger.debug(`[codegen] metag 落盘 fieldKey=${canonical}`);
}

/**
 * 依据节点信息构造 #code 能力。
 * name 固定为 '#code'；inputs/outputs 由外部传入；其余语义来自节点。
 */
function buildCapaFromNode(
    node: PNode,
    name: string,
    code: string,
    io: { input: string[]; output: string[] },
): NewCapability {
    return {
        id: node.id,
        name,
        role: node.intent ?? '',
        goal: node.name ?? '',
        code,
        input: io.input,
        output: io.output,
    };
}


/**
 * 依据一层 DAG 构造 #workflow 能力。
 * name 固定为 '#workflow'；code 保存本层 DAG 的 JSON。
 * repNode 为展开出本层的父节点；根层无父节点时为 undefined，role/goal 留空。
 */
function buildWorkflowCapa(
    graphId: string,
    repNode: PNode | undefined,
    layerJson: string,
    input: string[],
    output: string[],
): NewCapability {
    return {
        id: graphId,
        name: '#workflow',
        role: repNode?.intent ?? '',
        goal: repNode?.name ?? '',
        code: layerJson,
        input,
        output,
    };
}