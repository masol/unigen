/**
 * ============================================================================
 * 【P-Pass2b · logicalExpand:递归细化人类思维过程】
 * ============================================================================
 * 对每个"思维跨度太大,LLM 无法一步模拟"的环节,递归细化:
 * "这个人具体怎么想?分几步?每步看什么、想什么、产出什么?"
 *
 * 【终止条件:LLM 能否可靠模拟这个人类思维环节】
 * 三选一,任一命中即停:
 *   1. 确定性:这步不需要思维(格式转换/合并/排序),代码直接做。
 *   2. 单焦点:人类做这步时只需一个专注点、一次判断,思维链短。
 *      → 弱 LLM 一次调用可稳定模拟。
 *   3. 可信模拟:虽有一定复杂度,但 LLM 模拟人类这步思维的可信度足够。
 *      → 即使代码稍长,只要人类能一口气做完且思路清晰,LLM 也可以。
 *
 * 【下钻(COMPLEX)判据】这步人类的思维涉及多个可分离的专注点,
 * 需要切换思路/视角/关注对象——LLM 在单次调用中注意力稀释,质量会下降。
 * 拆开让每步只需一个专注点,LLM 才能稳定模拟。
 *
 * 深度达上限仍判 COMPLEX → 强制落叶,forcedNote 留痕。
 * 三态 facet 落盘:重入时 'no' 短路,不重复调 LLM。
 */
import { getSmartModel } from "$libs/model/index.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { PNode } from "$types/index.js";
import { DagDesignResult, Io } from "$types/shared/plan/nodes.js";
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import { EXPAND_CONCURRENCY, getExpandDepth } from "../config.js";
import { ConflictSignal, PlanContext } from "../context.js";
import {
    FacetNames, GDag, getFacet, isExecutable, NodeStatusValue, type WalkEntry,
} from "../graph/gdag.js";
import { designDag, makeExpandTask, registerLayer, ReviewFeedback } from "./dag.js";
import { fetchProcedurePrior } from "./skeleton.js";

// ─── 复杂度判定(拟人视角:LLM 能否可靠模拟这步人类思维) ─────────────────

const COMPLEXITY_PROMPT = `你是人类思维模拟可行性裁判。

一个人类专家在做某件事时有一个思维环节。现在要用 LLM 来模拟这步思维。
判断:LLM 能否在单次调用中可靠地模拟人类在这步的思考?

判据(按序检查,命中即停):

- DETERMINISTIC:这步不需要思维判断(格式转换/合并/排序/统计/模板填充等)。
  人类做这步也不需要"想",只是机械操作。代码直接实现。

- SINGLE_FOCUS:人类做这步时,只需一个专注点、一次判断:
  看一份材料,做一个决定,产出一个结果。思维链短,无需切换视角。
  LLM 一次调用可稳定模拟。

- COMPLEX:人类做这步时,脑子里需要同时或依次关注多个不同的点:
  比如先分析A维度,再评估B维度,再综合C维度做决定——
  这些关注点可以分离(先做完一个再做下一个,不会丢失信息)。
  LLM 在单次调用中处理多个专注点时注意力稀释,质量下降。
  必须拆开让每步只有一个专注点。

输出单行:
DETERMINISTIC
SINGLE_FOCUS
COMPLEX: <人类做这步时具体需要哪几个可分离的专注点,作为细化指引>
不要输出其他内容。`;

interface Verdict { kind: 'deterministic' | 'single_focus' | 'complex'; reason: string; }

async function judgeComplexity(node: PNode, pctx: PlanContext): Promise<Verdict> {
    const io = (ios: PNode['inputs']): string =>
        ios.map(i => `- ${i.name}:${i.intent}`).join("\n");
    const { text } = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions: COMPLEXITY_PROMPT,
        prompt: `思维环节:${node.name}\n` +
            `人类在做什么:${node.intent}\n\n` +
            `需要看的材料:\n${io(node.inputs)}\n\n` +
            `产出的成果:\n${io(node.outputs)}`,
    });
    const line = (text.trim().split("\n")[0] ?? "").trim();
    if (/^DETERMINISTIC\b/i.test(line)) return { kind: 'deterministic', reason: '' };
    if (/^SINGLE_FOCUS\b/i.test(line)) return { kind: 'single_focus', reason: '' };
    const m = line.match(/^COMPLEX[:：]?\s*(.*)$/i);
    if (m) return { kind: 'complex', reason: m[1] || '未给出理由' };
    Logger.warn(`[logical] 复杂度判定无法解析,按 COMPLEX:${line}`);
    return { kind: 'complex', reason: '判定输出无法解析,保守细化' };
}

// ─── 拆解质量评审(三评审器并行) ────────────────────────────────────────────

const REVIEW_OUTPUT_RULES = `宽松评审:只拦确定成立的问题,拿不准的一律放过。
无问题输出单行:PASS
有则逐条:ISSUE: [位置] [问题] [修正方向]
只输出上述格式。`;

const REVIEW_MONOTONE_PROMPT = `你是人类思维细化方案的评审器,只负责一个维度:细化是否真正发生。
一个人类思维环节被细化为更细的思维链。后续会继续递归,子环节允许仍复杂。

只在以下情形报告:
- 某子环节实质上就是原环节换了个说法(名义细化);
- 某子环节承担了原环节几乎全部思维,其余只是搬运/格式化。

不是问题(放过):子环节仍有一定复杂度但范围明确更小;分量不均。
${REVIEW_OUTPUT_RULES}`;

const REVIEW_REDUNDANCY_PROMPT = `你是人类思维细化方案的评审器,只负责一个维度:冗余。
"把它删掉,人类还能走完这个流程吗?"
1. 多余成果:移除某中间成果及产出它的环节,后续改用已有材料,最终交付仍能同质量完成?
2. 重复思维:两个子环节对相同材料做本质相同的思考?
${REVIEW_OUTPUT_RULES}`;

const REVIEW_DERIVABILITY_PROMPT = `你是人类思维细化方案的评审器,只负责一个维度:信息来源。
逐个子环节检查:人类做这步思考时,需要的信息类别,在其声明的输入材料中能否找到来源?
只要"这类信息可以从这份材料来"语义上说得通即通过。
只在"全部输入在语义上都不可能承载所需信息"时报告。
${REVIEW_OUTPUT_RULES}`;

interface ReviewerSpec { tag: string; instructions: string; withOriginal: boolean; }

const EXPANSION_REVIEWERS: ReviewerSpec[] = [
    { tag: "细化有效性", instructions: REVIEW_MONOTONE_PROMPT, withOriginal: true },
    { tag: "冗余", instructions: REVIEW_REDUNDANCY_PROMPT, withOriginal: false },
    { tag: "信息断链", instructions: REVIEW_DERIVABILITY_PROMPT, withOriginal: false },
];

async function reviewExpansion(
    node: PNode, blueprint: string, pctx: PlanContext,
): Promise<ReviewFeedback> {
    const io = (ios: Io[]): string => ios.map(i => `- ${i.name}:${i.intent}`).join("\n");
    const original =
        `原思维环节:${node.name}\n人类在做什么:${node.intent}\n` +
        `原输入:\n${io(node.inputs)}\n原输出:\n${io(node.outputs)}\n\n`;

    const runOne = async (spec: ReviewerSpec): Promise<string[]> => {
        const { text } = await generateText({
            model: getSmartModel(undefined, pctx.ctx),
            instructions: spec.instructions,
            prompt: (spec.withOriginal ? original : "") + `细化方案:\n${blueprint}`,
        });
        return text.split("\n")
            .filter(l => /^ISSUE:/i.test(l.trim()))
            .map(l => `[${spec.tag}] ${l.trim()}`);
    };

    const [monotone, redundancy, derivability] =
        await Promise.all(EXPANSION_REVIEWERS.map(runOne));

    if (monotone.length > 0)
        return { issues: [...monotone, ...redundancy, ...derivability], mode: 'redesign' };
    return { issues: [...redundancy, ...derivability], mode: 'patch' };
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

// ─── 单节点处理 ────────────────────────────────────────────────────────────

async function expandOne(e: WalkEntry, pctx: PlanContext): Promise<void> {
    const { node, depth, graphId } = e;
    const gdag = pctx.gdag;
    gdag.updateNode(node.id, { status: 'expanding' });

    // 重入短路
    if (isExecutable(node)) {
        gdag.updateNode(node.id, { status: 'awaiting_code' });
        pctx.persist();
        return;
    }

    // 复杂度判定(重入短路:双 'no' 免判)
    let verdict: Verdict;
    if (getFacet(node, FacetNames.simple) === 'no'
        && getFacet(node, FacetNames.codeable) === 'no') {
        verdict = { kind: 'complex', reason: '此前已判定为复杂(重入短路)' };
    } else {
        verdict = await judgeComplexity(node, pctx);
        gdag.setFacet(node.id, FacetNames.codeable, verdict.kind === 'deterministic' ? 'yes' : 'no');
        gdag.setFacet(node.id, FacetNames.simple, verdict.kind === 'single_focus' ? 'yes' : 'no');
    }

    if (verdict.kind === 'deterministic' || verdict.kind === 'single_focus') {
        gdag.updateNode(node.id, { status: 'awaiting_code' });
        Logger.debug(`[logical]「${node.name}」→ ${verdict.kind.toUpperCase()},LLM 可模拟,落叶`);
        pctx.persist();
        return;
    }

    // COMPLEX + 深度达上限:强制落叶
    const maxDepth = getExpandDepth(pctx.ctx.cmd.args ?? {});
    if (depth >= maxDepth) {
        const warning =
            `[logical]「${node.name}」深度 ${depth} 达上限仍判复杂(${verdict.reason})。` +
            `强制落叶,执行时 LLM 需额外 CoT。`;
        Logger.warn(warning);
        pctx.notify("plan/logical", warning);
        gdag.setFacet(node.id, FacetNames.simple, 'yes');
        gdag.updateNode(node.id, {
            status: 'awaiting_code',
            forcedNote: `深度熔断:${verdict.reason}`,
        });
        pctx.persist();
        return;
    }

    // COMPLEX:细化人类思维过程
    const pool = gdag.upstreamPool(graphId, node.id);
    const prior = await fetchProcedurePrior(
        `${node.outputs.map(o => o.name).join(",")} ${node.intent}`, pctx);
    const task = makeExpandTask(node, pool, {
        complexityReason: verdict.reason, procedurePrior: prior,
    });
    let layerId: string | null = null;

    await designDag(task, pctx, {
        review: (blueprint) => reviewExpansion(node, blueprint, pctx),
        postCheck: async (result: DagDesignResult): Promise<string[]> => {
            const lid = await registerLayer(result, pctx, false);
            const errs = checkLayerBoundary(pctx.gdag, lid, node, task.boundary!.availableInputs);
            if (errs.length > 0) {
                pctx.gdag.dropGraph(lid);
                return [...errs,
                `与可用材料/目标交付本质相同的成果必须直接使用其名称;` +
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

// ─── pass 入口 ─────────────────────────────────────────────────────────────

export async function logicalExpand(pctx: PlanContext): Promise<void> {
    const gdag = pctx.gdag;
    if (!gdag.rootId || !gdag.getGraph(gdag.rootId))
        throwUnprcessable(`[logical] 根层不存在,designTop 未完成`, true);

    for (const { node } of gdag.scan(NodeStatusValue.expanding))
        gdag.updateNode(node.id, { status: 'pending' });

    try {
        await gdag.walk(
            async (e) => { await expandOne(e, pctx); },
            { filter: (n) => n.status === 'pending', concurrency: EXPAND_CONCURRENCY },
        );
    } catch (err) {
        if (err instanceof AggregateError) {
            Logger.error(`[logical] 并行分支 ${err.errors.length} 处失败`);
            const conflict = err.errors.find(x => x instanceof ConflictSignal);
            throw conflict ?? err.errors[0];
        }
        throw err;
    }

    const leftovers = [...gdag.scan('pending'), ...gdag.scan(NodeStatusValue.conflict)];
    if (leftovers.length > 0)
        throwUnprcessable(`[logical] 遍历结束仍有未落定节点:` +
            leftovers.map(l => `「${l.node.name}」(${l.node.status})`).join("、"), true);

    pctx.persist();
    Logger.debug(`[logical] 完成:叶子 ${gdag.scan(NodeStatusValue.awaiting_code).length} 个,` +
        `展开 ${gdag.scan(NodeStatusValue.expanded).length} 个`);
}