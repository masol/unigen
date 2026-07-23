/**
 * ============================================================================
 * 【P-Pass2 · logicalExpand:递归展开人类思维过程】
 * ============================================================================
 */
import { getSmartModel } from "$libs/model/index.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { PNode } from "$types/index.js";
import { DagDesignResult } from "$types/shared/plan/nodes.js";
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import { EXPAND_CONCURRENCY, getExpandDepth, getThinkDepth } from "../config.js";
import { ConflictSignal, PlanContext } from "../context.js";
import {
    FacetNames, GDag, getFacet, NodeStatusValue,
    type NodeStructuralSignal, type WalkEntry,
} from "../graph/gdag.js";
import { globalKnowledgeDB, NODE_PRIOR_STRONG_THRESHOLD } from "../knowledge.js";
import { designDag, makeExpandTask, registerLayer } from "./dag.js";
import { fetchProcedurePrior } from "./skeleton.js";

const JUDGE_PROMPT = `你是人类工作流的"展开价值 + 复杂度"双维度裁判。

先判断这个思维环节**值不值得**被进一步细化，再判断它**能不能**被细化。
两个维度都要给结论。核心目标：**避免在与用户诉求无关、或对最终交付无实质贡献的细枝末节上浪费细化**。

## 用户的原始诉求（最终目标锚点）
{user_goal}

## 当前环节
环节名：{name}
人类在做什么：{intent}
输入材料：
{inputs}
产出成果：
{outputs}

## 该环节在本层工作流中的结构地位（客观图属性，供价值判断参考）
{structural}

—— 结构信号解读：
- 下游消费者多 / 后代多 / 在关键路径上 / 离最终交付近 → 该环节是"承重节点"，其质量直接影响最终交付。
- 消费者少 / 不在关键路径 / 离最终交付远 → 该环节多半是辅助、兜底或边缘步骤。

## 第一维度：WORTH（是否值得展开）

- **core（承重）**：这个环节的产出是**最终交付物的实质组成部分**，或位于从材料到交付的主干链路上，做不好会直接损害用户想要的结果。
- **peripheral（边缘）**：这个环节与用户诉求**关系疏远**，或只是辅助性/装饰性/兜底性步骤（如无关紧要的格式微调、边角校验、可有可无的补充说明）。即便它本身有一套"正规做法"，把它展开对最终目标也**几乎没有增益**。

【关键原则】"有没有正规工作流" ≠ "值不值得展开"。
很多环节（如错别字校对、字段格式规整）都有标准做法，但对本次用户诉求而言无足轻重——这类一律判 peripheral，不要因为"它有正规流程"就想展开它。
判 core 的门槛是：**它是否真的承载了用户想要的核心价值**。结合上面的结构地位一起判断。

## 第二维度：KIND（能否/如何展开，仅在你已判 WORTH 后给出）

### LEAF_DETERMINISTIC — 纯代码可实现
机械操作：格式转换、统计、排序、合并、模板填充、查表映射等，无需任何思维判断。

### LEAF_EMPIRICAL — 人类凭经验一步到位
做这步时没有中间可审核交付物：看材料→脑中转一下→直接给结果，拆不出可独立审核的中间产物。
例："判断情感倾向"、"给代码选分类标签"。

### EXPAND — 有成熟的人类标准工作流
该领域从业者都知道的公认分步做法，且步骤间存在中间可审核交付物（大纲、初稿、修改意见…）。
例："写市场分析报告"、"调试 bug"。
【反幻觉】没有公认标准做法、或你不确定，一律按 LEAF 处理。

## 输出格式（严格两行）

第一行：WORTH: core   或   WORTH: peripheral
第二行（三选一）：
LEAF_DETERMINISTIC — {原因}
LEAF_EMPIRICAL — {原因}
EXPAND — {工作流概述，一句话，含至少一个中间交付物名称}

不要输出其他内容。`;

interface Verdict {
    worth: 'core' | 'peripheral';
    kind: 'leaf_det' | 'leaf_emp' | 'expand';
    reason: string;
}

function fmtStructural(s: NodeStructuralSignal): string {
    const dist = s.distanceToTerminal < 0
        ? "不可达最终交付（疑似旁支）"
        : s.distanceToTerminal === 0
            ? "本身即最终交付节点"
            : `距最终交付 ${s.distanceToTerminal} 跳`;
    return [
        `- 下游直接消费者：${s.directConsumers} 个`,
        `- 下游可达节点总数：${s.totalDescendants} 个`,
        `- 与最终交付的距离：${dist}`,
        `- 是否在关键路径上：${s.onCriticalPath ? "是（主干链路）" : "否（非主干）"}`,
    ].join("\n");
}

async function judgeNode(
    node: PNode, signal: NodeStructuralSignal, pctx: PlanContext,
): Promise<Verdict> {
    const fmtIo = (names: string[]): string =>
        names.map(n => {
            const io = pctx.gdag.getIo(n);
            return `- ${n}:${io?.intent ?? ''}`;
        }).join("\n");
    const instructions = JUDGE_PROMPT
        .replace('{user_goal}', pctx.user || "（未提供，请仅依据结构地位判断价值）")
        .replace('{name}', node.name)
        .replace('{intent}', node.intent)
        .replace('{inputs}', fmtIo(node.inputs))
        .replace('{outputs}', fmtIo(node.outputs))
        .replace('{structural}', fmtStructural(signal));
    const { text } = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions,
        prompt: `请判断。`,
    });

    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);

    // 解析 WORTH（默认保守取 core，避免误伤；真正的过滤靠 LLM 明确判 peripheral）
    let worth: 'core' | 'peripheral' = 'core';
    const worthLine = lines.find(l => /^WORTH\s*[:：]/i.test(l));
    if (worthLine && /peripheral/i.test(worthLine)) worth = 'peripheral';

    // 解析 KIND
    const kindLine = lines.find(l =>
        /^(LEAF_DETERMINISTIC|LEAF_EMPIRICAL|EXPAND)\b/i.test(l)) ?? "";

    let kind: Verdict['kind'] = 'leaf_emp';
    let reason = '判定输出无法解析，保守落叶';
    if (/^LEAF_DETERMINISTIC\b/i.test(kindLine)) {
        const m = kindLine.match(/^LEAF_DETERMINISTIC\s*[—\-:：]?\s*(.*)$/i);
        kind = 'leaf_det'; reason = m?.[1] || '纯代码';
    } else if (/^LEAF_EMPIRICAL\b/i.test(kindLine)) {
        const m = kindLine.match(/^LEAF_EMPIRICAL\s*[—\-:：]?\s*(.*)$/i);
        kind = 'leaf_emp'; reason = m?.[1] || '凭经验一步到位';
    } else if (/^EXPAND\b/i.test(kindLine)) {
        const m = kindLine.match(/^EXPAND\s*[—\-:：]?\s*(.*)$/i);
        kind = 'expand'; reason = m?.[1] || '存在标准工作流';
    } else {
        Logger.warn(`[expand] KIND 无法解析，按 LEAF_EMPIRICAL：${text.trim().slice(0, 120)}`);
    }

    return { worth, kind, reason };
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

// ─── 判定决策：价值优先 + think-depth 逃生舱 ────────────────────────────────

function decideExpand(
    verdict: Verdict, depth: number, thinkDepth: number,
): { shouldExpand: boolean; reason: string } {
    // 价值门槛：边缘节点直接落叶（think-depth 显式要求深挖时可覆盖）
    if (verdict.worth === 'peripheral') {
        if (depth < thinkDepth) {
            return {
                shouldExpand: true,
                reason: `think-depth=${thinkDepth} 覆盖价值门槛（边缘节点但深度 ${depth} < ${thinkDepth}）`,
            };
        }
        // 纯代码边缘节点也无需展开，直接落叶
        return { shouldExpand: false, reason: `边缘节点（peripheral），不展开：${verdict.reason}` };
    }

    // 承重节点：走可展开性判断
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
    return { shouldExpand: true, reason: verdict.reason };
}

// ─── PNode → DagNode（展开任务用，需含完整 Io） ─────────────────────────────

function nodeToDagNode(node: PNode, gdag: GDag) {
    return {
        name: node.name,
        kind: node.kind,
        intent: node.intent,
        inputs: gdag.getIos(node.inputs).map(io => ({
            ...io, qualityCriteria: [], sizeEstimate: 'small' as const, isArray: false,
        })),
        outputs: gdag.getIos(node.outputs).map(io => ({
            ...io, qualityCriteria: [], sizeEstimate: 'small' as const, isArray: false,
        })),
    };
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

    // 节点级 RAG 强匹配（强匹配代表该环节确有承重且成熟的工作流，直接展开）
    const ragHit = await fetchNodePrior(node, pctx);

    let decision: { shouldExpand: boolean; reason: string };
    if (ragHit) {
        decision = { shouldExpand: true, reason: `RAG 强匹配：${ragHit.slice(0, 50)}...` };
    } else {
        // 计算本节点在所在层的结构地位，连同用户诉求一起交给 LLM 双维度判定
        const signal = gdag.structuralSignal(graphId, node.id);
        const verdict = await judgeNode(node, signal, pctx);

        // 自然落叶（承重但一步到位/纯代码，或边缘节点且已达 think-depth）标记为 simple，
        // 供重入短路。承重且待 EXPAND 的不标记。
        const naturalLeaf =
            (verdict.worth === 'peripheral' || verdict.kind !== 'expand') && depth >= thinkDepth;
        if (naturalLeaf) {
            gdag.setFacet(node.id, FacetNames.simple, 'yes');
        }
        decision = decideExpand(verdict, depth, thinkDepth);
        Logger.debug(
            `[expand]「${node.name}」worth=${verdict.worth} kind=${verdict.kind} ` +
            `→ ${decision.shouldExpand ? 'EXPAND' : 'LEAF'}（${decision.reason}）`);
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
        `${node.outputs.join(",")} ${node.intent}`, pctx);
    const task = makeExpandTask(nodeToDagNode(node, gdag), pool, {
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
    const have = new Set(node.inputs);
    const extraNames = pool
        .filter(io => usedInitials.includes(io.name) && !have.has(io.name))
        .map(io => io.name);
    if (extraNames.length > 0) pctx.gdag.addNodeInputs(graphId, node.id, extraNames);

    pctx.gdag.attachSubDag(node.id, layerId!);
    pctx.persist();
}

// ─── 边界复核 ──────────────────────────────────────────────────────────────

function checkLayerBoundary(
    gdag: GDag, layerId: string, node: PNode, availableInputs: { name: string; intent: string }[],
): string[] {
    const errs: string[] = [];
    const avail = new Set(availableInputs.map(i => i.name));
    const outputs = new Set(node.outputs);

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