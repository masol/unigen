/**
 * ============================================================================
 * 【physical · libraryPhase:大库/索引适配】
 * ============================================================================
 * 两种模式:
 *   A. 大库合并(code):并行塞数据建索引,召回走索引
 *   B. LLM 查询(rag+rerank):语义检索 + rerank,top-N 召回
 * 入库节点的语义描述(semanticHint)与查询节点 intent 必须对齐。
 */
import { Artifact, IndexMeta, PNode, SizeEstimateT } from "$types/shared/plan/nodes.js";
import Logger from "electron-log/main.js";
import { LIBRARY_INTENT_HINTS, RAG_DEFAULT_TOPK, RAG_RERANK_KEEP } from "../../config.js";
import { PlanContext } from "../../context.js";
import { NodeStatusValue } from "../../graph/gdag.js";

function intentHasAny(intent: string, hints: readonly string[]): boolean {
    return hints.some(h => intent.includes(h));
}

function makeArtifact(name: string, intent: string): Artifact {
    return { name, intent, qualityCriteria: [], sizeEstimate: 'small' };
}

export async function libraryPhase(pctx: PlanContext): Promise<{
    indexed: number; retrieved: number; mismatches: string[];
}> {
    const gdag = pctx.gdag;
    let indexed = 0, retrieved = 0;
    const mismatches: string[] = [];

    const needIndex: { graphId: string; node: PNode }[] = [];
    const needRetrieve: { graphId: string; node: PNode }[] = [];

    for (const { graphId, node } of gdag.scan(NodeStatusValue.awaiting_code)) {
        if (node.synthetic) continue;
        if (intentHasAny(node.intent, LIBRARY_INTENT_HINTS.index))
            needIndex.push({ graphId, node });
        if (intentHasAny(node.intent, LIBRARY_INTENT_HINTS.retrieve))
            needRetrieve.push({ graphId, node });
    }

    for (const { graphId, node } of needIndex) {
        if (node.kind === 'index') continue;
        const inputIo = node.inputs[0];
        if (!inputIo) continue;
        const indexName = `${inputIo.name}_index`;
        const indexMeta: IndexMeta = {
            indexName,
            sizeEstimate: (gdag.getArtifact(inputIo.name)?.sizeEstimate ?? 'large') as SizeEstimateT,
            semanticHint: node.intent,
            mode: 'exact',
        };
        const metaArtifact = makeArtifact(`${indexName}__meta`, `索引「${indexName}」元数据`);
        await gdag.registerArtifact(metaArtifact, pctx.ctx);

        const indexNode: PNode = {
            id: crypto.randomUUID(),
            name: `入库-${node.name}`,
            kind: 'index',
            intent: `将「${inputIo.name}」构建为可查询索引「${indexName}」`,
            inputs: [inputIo],
            outputs: [metaArtifact],
            status: 'awaiting_code',
            dag: null, error: null, facets: { codeable: 'yes' },
            synthetic: true,
            indexMeta,
        };
        gdag.injectBeforeNode(graphId, node.id, indexNode);
        indexed++;
    }

    for (const { graphId, node } of needRetrieve) {
        if (node.kind === 'retrieve') continue;
        const upstreamMeta = gdag.findUpstreamIndexMeta(graphId, node.id);
        const indexName = upstreamMeta?.indexName ?? `${node.inputs[0]?.name ?? 'data'}_index`;
        const semanticHint = upstreamMeta?.semanticHint ?? node.intent;

        const hitsArtifact = makeArtifact(
            `${indexName}__hits`,
            `从「${indexName}」检索到的 top ${RAG_RERANK_KEEP} 条`);
        await gdag.registerArtifact(hitsArtifact, pctx.ctx);

        const retrieveNode: PNode = {
            id: crypto.randomUUID(),
            name: `检索-${node.name}`,
            kind: 'retrieve',
            intent: `从索引「${indexName}」语义检索(提示:${semanticHint}),` +
                `rag top ${RAG_DEFAULT_TOPK},rerank 留 top ${RAG_RERANK_KEEP}`,
            inputs: [makeArtifact(`${indexName}__meta`, `索引「${indexName}」元数据`)],
            outputs: [hitsArtifact],
            status: 'awaiting_code',
            dag: null, error: null, facets: {},
            synthetic: true,
        };
        gdag.injectBeforeNode(graphId, node.id, retrieveNode);
        retrieved++;

        if (upstreamMeta) {
            const sim = simpleSemanticMatch(semanticHint, node.intent);
            if (sim < 0.3) {
                mismatches.push(
                    `「${node.name}」查询语义与索引「${indexName}」入库语义不匹配`);
            }
        }
    }

    if (mismatches.length > 0) {
        Logger.warn(`[physical/library] ${mismatches.length} 处语义不匹配`);
    }

    pctx.persist();
    return { indexed, retrieved, mismatches };
}

function simpleSemanticMatch(a: string, b: string): number {
    const wa = new Set(a.split(/[\s,。、]+/).filter(w => w.length > 1));
    const wb = new Set(b.split(/[\s,。、]+/).filter(w => w.length > 1));
    if (wa.size === 0 || wb.size === 0) return 0;
    let inter = 0;
    for (const w of wa) if (wb.has(w)) inter++;
    return inter / Math.max(wa.size, wb.size);
}