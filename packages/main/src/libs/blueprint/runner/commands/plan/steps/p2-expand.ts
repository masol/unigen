/**
 * ============================================================================
 * 【P-Pass2 · logicalExpand:递归展开人类思维过程】
 * ============================================================================
 */
import { getSmartModel } from "$libs/model/index.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { PNode } from "$types/index.js";
import { DagDesignResult, Io } from "$types/shared/plan/nodes.js";
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import { EXPAND_CONCURRENCY, getExpandDepth, getThinkDepth } from "../config.js";
import { ConflictSignal, PlanContext } from "../context.js";
import {
    FacetNames, GDag, getFacet, NodeStatusValue, type WalkEntry,
} from "../graph/gdag.js";
import { globalKnowledgeDB, NODE_PRIOR_STRONG_THRESHOLD } from "../knowledge.js";
import { designDag, makeExpandTask, registerLayer } from "./dag.js";
import { fetchProcedurePrior } from "./skeleton.js";

const JUDGE_PROMPT = `你是人类工作流复杂度裁判。

以下是一个思维环节，判断它是否有**成熟的人类标准工作流**（即领域从业者都知道的分步做法，且步骤间有**中间可审核交付物**）。

环节名：${'{name}'}
人类在做什么：${'{intent}'}
输入材料：
${'{inputs}'}
产出成果：
${'{outputs}'}

## 判据（按优先级检查，命中即停）

### 1. LEAF_DETERMINISTIC — 纯代码可实现
这步是机械操作：格式转换、统计、排序、合并、模板填充、查表映射等。
**不需要任何思维判断**。代码直接实现。

### 2. LEAF_EMPIRICAL — 人类凭经验一步到位
人类做这步时**没有中间可审核交付物**：
- 看一份材料 → 脑子里转一下 → 直接给出结果
- 没有"先写大纲、再写初稿、再改稿"这种中间步骤
- 步骤之所以是"一步"，是因为拆不出任何"可独立审核"的中间产物

典型例子："判断这段话的情感倾向"、"给这段代码选个分类标签"、"识别图片里的物体"。

### 3. EXPAND — 有成熟的人类标准工作流
该领域从业者**都知道**有公认的分步做法，且步骤间存在**中间可审核的交付物**：
- 每一步产出都可以被独立审视（大纲、初稿、修改意见...）
- 步骤不是因为"细"才拆开，而是因为"独立可审核"才拆开

典型例子："写一份市场分析报告"（大纲→数据收集→撰写→校对）、
"调试一个 bug"（复现→定位→修复→验证）。

【反幻觉】如果该领域没有公认的标准做法，或你不确定是否有，**按 LEAF 处理**。
宁可让 LLM 直接做（CoT 兜底），也不要编造不存在的工作流。

## 输出格式（单行）

LEAF_DETERMINISTIC — {原因}
LEAF_EMPIRICAL — {原因}
EXPAND — {工作流概述，一句话，必须包含至少一个中间交付物名称}

不要输出其他内容。`;

interface Verdict {
    kind: 'leaf_det' | 'leaf_emp' | 'expand';
    reason: string;
}

async function judgeNode(node: PNode, pctx: PlanContext): Promise<Verdict> {
    const fmtIo = (ios: Io[]): string => ios.map(i => `- ${i.name}:${i.intent}`).join("\n");
    const instructions = JUDGE_PROMPT
        .replace('{name}', node.name)
        .replace('{intent}', node.intent)
        .replace('{inputs}', fmtIo(node.inputs))
        .replace('{outputs}', fmtIo(node.outputs));
    const { text } = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions,
        prompt: `请判断。`,
    });
    const line = text.trim().split('\n')[0] ?? "";
    if (/^LEAF_DETERMINISTIC\b/i.test(line)) {
        const m = line.match(/^LEAF_DETERMINISTIC\s*[—\-:：]?\s*(.*)$/i);
        return { kind: 'leaf_det', reason: m?.[1] || '纯代码' };
    }
    if (/^LEAF_EMPIRICAL\b/i.test(line)) {
        const m = line.match(/^LEAF_EMPIRICAL\s*[—\-:：]?\s*(.*)$/i);
        return { kind: 'leaf_emp', reason: m?.[1] || '凭经验一步到位' };
    }
    if (/^EXPAND\b/i.test(line)) {
        const m = line.match(/^EXPAND\s*[—\-:：]?\s*(.*)$/i);
        return { kind: 'expand', reason: m?.[1] || '存在标准工作流' };
    }
    Logger.warn(`[expand] 判定无法解析，按 LEAF_EMPIRICAL：${line}`);
    return { kind: 'leaf_emp', reason: '判定输出无法解析，保守落叶' };
}

// ─── 节点级 RAG 强匹配 ──────────────────────────────────────────────────────

async function fetchNodePrior(node: PNode, _pctx: PlanContext): Promise<string | null> {
    if (!globalKnowledgeDB.searchNodePrior) return null;
    const hits = await globalKnowledgeDB.searchNodePrior(node.name, node.intent, 1);
    if (hits.length === 0) return null;
    const top = hits[0];
    if ((top.score ?? 0) < NODE_PRIOR_STRONG_THRESHOLD) return null;
    Logger.debug(`[expand]「${node.name}」RAG 强匹配 (score=${top.score})，直接 EXPAND`);
    return top.procedure;
}

// ─── 判定决策：结合 think-depth ────────────────────────────────────────────

/**
 * 综合判定结果与用户期望的思维深度，决定是否展开
 * - LEAF_DETERMINISTIC → 无条件落叶（即使 think-depth 也无法展开为有意义的工作流）
 * - LEAF_EMPIRICAL 且 depth < thinkDepth → 强制展开（think-depth 干预）
 * - LEAF_EMPIRICAL 且 depth >= thinkDepth → 落叶
 * - EXPAND → 展开
 */
function decideExpand(
    verdict: Verdict, depth: number, thinkDepth: number,
): { shouldExpand: boolean; reason: string } {
    if (verdict.kind === 'leaf_det') {
        return { shouldExpand: false, reason: verdict.reason };
    }
    if (verdict.kind === 'leaf_emp') {
        if (depth < thinkDepth) {
            return {
                shouldExpand: true,
                reason: `think-depth=${thinkDepth} 强制展开（LEAF_EMPIRICAL 但深度 ${depth} < ${thinkDepth}）`,
            };
        }
        return { shouldExpand: false, reason: verdict.reason };
    }
    // EXPAND
    return { shouldExpand: true, reason: verdict.reason };
}

// ─── 单节点处理 ────────────────────────────────────────────────────────────

async function expandOne(e: WalkEntry, pctx: PlanContext): Promise<void> {
    const { node, depth, graphId } = e;
    const gdag = pctx.gdag;
    gdag.updateNode(node.id, { status: 'expanding' });

    // 重入短路：已判定为 LEAF
    if (getFacet(node, FacetNames.simple) === 'yes') {
        gdag.updateNode(node.id, { status: 'awaiting_code' });
        pctx.persist();
        return;
    }

    const thinkDepth = getThinkDepth(pctx.ctx.cmd.args ?? {});

    // 节点级 RAG 强匹配（直接 EXPAND，跳过判定）
    const ragHit = await fetchNodePrior(node, pctx);

    let decision: { shouldExpand: boolean; reason: string };
    if (ragHit) {
        decision = { shouldExpand: true, reason: `RAG 强匹配：${ragHit.slice(0, 50)}...` };
    } else {
        const verdict = await judgeNode(node, pctx);
        // 只有原生 LEAF（非 think-depth 干预）才标 facet
        const isNaturalLeaf = verdict.kind !== 'expand' && depth >= thinkDepth;
        if (isNaturalLeaf) {
            gdag.setFacet(node.id, FacetNames.simple, 'yes');
        }
        decision = decideExpand(verdict, depth, thinkDepth);
    }

    if (!decision.shouldExpand) {
        gdag.updateNode(node.id, { status: 'awaiting_code' });
        Logger.debug(`[expand]「${node.name}」→ LEAF（${decision.reason}）`);
        pctx.persist();
        return;
    }

    // EXPAND + 深度达限：强制落叶
    const maxDepth = getExpandDepth(pctx.ctx.cmd.args ?? {});
    if (depth >= maxDepth) {
        const warning =
            `[expand]「${node.name}」深度 ${depth} 达上限仍判 EXPAND（${decision.reason}）。` +
            `强制落叶，执行时 LLM 需额外 CoT。`;
        Logger.warn(warning);
        pctx.notify("plan/expand", warning);
        gdag.setFacet(node.id, FacetNames.simple, 'yes');
        gdag.updateNode(node.id, {
            status: 'awaiting_code',
            forcedNote: `深度熔断：${decision.reason}`,
        });
        pctx.persist();
        return;
    }

    // EXPAND：细化
    const pool = gdag.upstreamPool(graphId, node.id);
    const prior = ragHit || await fetchProcedurePrior(
        `${node.outputs.map(o => o.name).join(",")} ${node.intent}`, pctx);
    const task = makeExpandTask(node, pool, {
        expandReason: decision.reason, procedurePrior: prior,
    });
    let layerId: string | null = null;

    await designDag(task, pctx, {
        postCheck: async (result: DagDesignResult): Promise<string[]> => {
            const lid = await registerLayer(result, pctx, false);
            const errs = checkLayerBoundary(pctx.gdag, lid, node, task.boundary!.availableInputs);
            if (errs.length > 0) {
                pctx.gdag.dropGraph(lid);
                return [...errs,
                `与可用材料/目标交付本质相同的成果必须直接使用其名称；` +
                `新中间成果请用显著不同的命名。`];
            }
            layerId = lid;
            return [];
        },
    });

    // 增量回写
    const usedInitials = pctx.gdag.getGraph(layerId!)
        ? pctx.gdag.initialArtifacts(layerId!) : [];
    const have = new Set(node.inputs.map(i => i.name));
    const extra = pool.filter(io => usedInitials.includes(io.name) && !have.has(io.name));
    if (extra.length > 0) pctx.gdag.addNodeInputs(graphId, node.id, extra);

    pctx.gdag.attachSubDag(node.id, layerId!);
    pctx.persist();
}

// ─── 边界复核 ──────────────────────────────────────────────────────────────

function checkLayerBoundary(
    gdag: GDag, layerId: string, node: PNode, availableInputs: Io[],
): string[] {
    const errs: string[] = [];
    const avail = new Set(availableInputs.map(i => i.name));
    const outputs = new Set(node.outputs.map(o => o.name));

    for (const a of gdag.initialArtifacts(layerId))
        if (!avail.has(a))
            errs.push(`子层初始材料「${a}」不在可用材料清单中`);

    const terms = new Set(gdag.terminalArtifacts(layerId));
    for (const t of terms)
        if (!outputs.has(t)) errs.push(`子层终端成果「${t}」不在目标交付中`);
    for (const o of outputs)
        if (!terms.has(o)) errs.push(`目标交付「${o}」不是子层终端成果`);
    return errs;
}

// ─── pass 入口 ─────────────────────────────────────────────────────────────

export async function logicalExpand(pctx: PlanContext): Promise<void> {
    const gdag = pctx.gdag;
    if (!gdag.rootId || !gdag.getGraph(gdag.rootId))
        throwUnprcessable(`[expand] 根层不存在，designTop 未完成`, true);

    for (const { node } of gdag.scan(NodeStatusValue.expanding))
        gdag.updateNode(node.id, { status: 'pending' });

    try {
        await gdag.walk(
            async (e) => { await expandOne(e, pctx); },
            { filter: (n) => n.status === 'pending', concurrency: EXPAND_CONCURRENCY },
        );
    } catch (err) {
        if (err instanceof AggregateError) {
            Logger.error(`[expand] 并行分支 ${err.errors.length} 处失败`);
            const conflict = err.errors.find(x => x instanceof ConflictSignal);
            throw conflict ?? err.errors[0];
        }
        throw err;
    }

    const leftovers = [...gdag.scan('pending'), ...gdag.scan(NodeStatusValue.conflict)];
    if (leftovers.length > 0)
        throwUnprcessable(`[expand] 遍历结束仍有未落定节点：` +
            leftovers.map(l => `「${l.node.name}」(${l.node.status})`).join("、"), true);

    pctx.persist();
    Logger.debug(`[expand] 完成：叶子 ${gdag.scan(NodeStatusValue.awaiting_code).length} 个，` +
        `展开 ${gdag.scan(NodeStatusValue.expanded).length} 个`);
}