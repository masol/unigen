/**
 * ============================================================================
 * 【P-22a · 实现路径判定(形态分流+链路建图版)】
 * ============================================================================
 * FORM(单次分类,判据:LLM 原始输出能否直接是该文件) →
 *   text   → 直接返回 {kind:'text'}(文本侧展开由上层另行处理);
 *   binary → CHAIN 收敛 → resolveChain 反推外部输入/输出 + guard(失败带 feedback
 *            回炉,最多 MAX_LAYER_RETRY 次)→ 就地建 DAG 落库 → {kind:'dag', id};
 *   other  → impossible(调用方按 blocked 处理)。
 */
import { makePlanDesc } from '$libs/blueprint/capability/is.js';
import { getSmartModel } from '$libs/model/balancer/get-smart-model.js';
import { safefmt } from '$libs/model/llm/outline.js';
import { PrjDB } from '$libs/project/controllers/drizzle/index.js';
import { throwUnprcessable } from '$libs/utils/err.js';
import type { IRunnerContext } from '$types/blueprint/context.js';
import { generateText, Output } from 'ai';
import Logger from 'electron-log/main.js';
import { DirectedGraph } from 'graphology';
import { hasCycle } from 'graphology-dag';
import pMap from 'p-map';
import {
    CRITIQUE_CONCURRENCY,
    FORM_BINARY,
    FORM_OTHER,
    FORM_TEXT,
    getRefineRounds,
    MAX_LAYER_RETRY,
    NO_ISSUE_MARK,
    NODE_PENDING,
    WORKFLOW_PREFIX
} from '../config.js';
import type { TermType } from '../prompts/anchor.js';
import {
    CHAIN_FACETS,
    CHAIN_SYSTEM,
    ChainSchema,
    chainUser,
    FORM_SYSTEM,
    formUser,
    IMPOSSIBLE_MARK,
    REALIZE_REFINE_SYSTEM,
    realizeCritiqueSystem,
    realizeCritiqueUser,
    realizeRefineUser,
    type ChainOut,
} from '../prompts/realize.js';
import { resolveChain, type ResolvedChain } from './resolve-chain.js';

const tag = '[plan:realize]';

// name 状态编码(与 expand 一致)
// const PLAN_PENDING = '#plan::pending';

/** 判定结果:三种出路 */
export type RealizeResult =
    | { kind: 'text' }                          // 文本交付物,交上层文本侧处理
    | { kind: 'dag'; id: string }               // 二进制链路已建图落库,返回子层能力 id
    | { kind: 'impossible'; reason: string };   // 阻塞,调用方标 blocked

/** 通用 Prism 收敛:固定剖面并发批判 → 精炼,全剖面无问题提前跳出 */
async function converge(p: {
    facets: readonly { name: string; checksWhat: string }[];
    targetLine: string;
    extra: string;
    draft: string;
    label: string;
    ctx: IRunnerContext;
}): Promise<string> {
    let draft = p.draft;
    const maxRounds = getRefineRounds(p.ctx);
    for (let round = 1; round <= maxRounds; round++) {
        const critiques = (
            await pMap(
                p.facets,
                async (f) => {
                    const textResult = await generateText({
                        model: getSmartModel(undefined, p.ctx),
                        instructions: realizeCritiqueSystem(f),
                        prompt: realizeCritiqueUser({ targetLine: p.targetLine, extra: p.extra, draft, facetName: f.name }),
                    });
                    Logger.debug(`[${f.name}] converge评审结果：`, textResult.text);
                    return { facet: f.name, text: textResult.text };
                },
                { concurrency: CRITIQUE_CONCURRENCY },
            )
        ).filter((c) => !c.text.includes(NO_ISSUE_MARK));

        if (critiques.length === 0) {
            Logger.debug(`${tag} ${p.label} 第${round}轮全剖面无问题,收敛`);
            break;
        }
        const draftResult = await generateText({
            model: getSmartModel(undefined, p.ctx),
            instructions: REALIZE_REFINE_SYSTEM,
            prompt: realizeRefineUser({ targetLine: p.targetLine, extra: p.extra, draft, critiques }),
        });

        draft = draftResult.text;
        Logger.debug(`${tag} ${p.label} refined#${round}`);
    }
    return draft;
}

/**
 * 已解析链路 → 建 DAG 并落库,返回承载该 DAG 的能力 id。
 * - 外部纯文本输入 → PLAN_PENDING 叶子(文本侧递归)
 * - 程序步         → CODE_PENDING 原子叶子
 * - 父能力         → WORKFLOW,code = graphology 序列化串
 */
function buildChainDag(p: {
    resolved: ResolvedChain;
    target: TermType;
    goal: string;
    ctx: IRunnerContext;
}): string {
    const prjdb = PrjDB.ensure(p.ctx.prj);
    const graph = new DirectedGraph();
    const producer = new Map<string, string>(); // 产出名 → 节点 id

    // 1) 外部纯文本输入
    // for (const inp of p.resolved.inputs) {
    //     prjdb.upcertMetag({ fieldKey: inp.name, intent: inp.intent });
    //     const tid = prjdb.upcertCapa({
    //         name: PLAN_PENDING,
    //         input: [],
    //         output: [inp.name],
    //         goal: `产出文本材料「${inp.name}」:${inp.intent}(被链路第 ${inp.usedBy.join('、')} 步引用)`,
    //         criteria: '',
    //         negative: '',
    //     });
    //     graph.addNode(tid);
    //     producer.set(inp.name, tid);
    // }

    // 2) 程序步 → 原子叶子
    for (const s of p.resolved.steps) {
        prjdb.upcertMetag({ fieldKey: s.output_name, intent: s.output_intent });
        const sid = prjdb.upcertCapa({
            name: makePlanDesc(NODE_PENDING),
            input: s.inputs.map((i) => i.name),
            output: [s.output_name],
            goal: `调用 ${s.program}(候选:${s.candidates.join('、')})`,
            criteria: '',
            negative: '',
        });
        graph.addNode(sid);
        producer.set(s.output_name, sid);
    }

    // 3) 连边(resolveChain 已保证可解析、无环)
    for (const s of p.resolved.steps) {
        const sid = producer.get(s.output_name)!;
        for (const input of s.inputs) {
            const src = producer.get(input.name);
            if (src && src !== sid) graph.addEdge(src, sid);
        }
    }

    if (graph.order === 0) throwUnprcessable(`链路子层为空:${p.target.name}`);
    if (hasCycle(graph)) throwUnprcessable(`链路子层存在环:${p.target.name}`);

    // 4) 父能力承载 DAG
    prjdb.upcertMetag({ fieldKey: p.target.name, intent: p.target.intent });
    const dagId = prjdb.upcertCapa({
        name: WORKFLOW_PREFIX,
        input: p.resolved.inputs.map((i) => i.name),
        output: p.resolved.outputs,
        goal: p.goal,
        criteria: '',
        negative: '',
        code: JSON.stringify(graph.export()),
    });

    Logger.info(`${tag} ${p.target.name} → DAG ${dagId}:${graph.order} 节点 / ${graph.size} 边`);
    return dagId;
}

export async function realizeOutput(p: {
    target: TermType;
    goal: string;
    criteria: string[];
    availablePrograms: string;
    availableTexts: string;
    ctx: IRunnerContext;
}): Promise<RealizeResult> {
    const { ctx } = p;
    const targetLine = `- 名称: ${p.target.name} ｜ 说明: ${p.target.intent}`;

    // ================================================================
    // FORM:形态分类(单次,哨兵输出;解析失败重试一次)
    // ================================================================
    const formResult = await generateText({
        model: getSmartModel(undefined, ctx),
        instructions: FORM_SYSTEM,
        prompt: formUser(p.target),
        temperature: 0,
    });

    let form = formResult.text;
    if (![FORM_TEXT, FORM_BINARY, FORM_OTHER].some((m) => form.includes(m))) {
        Logger.warn(`${tag} FORM 输出无哨兵,重试一次: ${form.slice(0, 80)}`);
        const retry = await generateText({
            model: getSmartModel(undefined, ctx),
            instructions: FORM_SYSTEM,
            prompt: formUser(p.target),
            temperature: 0,
        });
        form = retry.text;
    }
    Logger.info(`${tag} FORM[${p.target.name}] → ${form.trim().slice(0, 40)}`);

    // ---- other:不是数字文件,无法实现 ----
    if (form.includes(FORM_OTHER)) {
        const msg = `非数字交付物,无法由本系统产出: ${p.target.name}`;
        Logger.error(msg);
        throwUnprcessable(msg);
    }

    // ---- text:直接返回,文本侧展开由上层处理 ----
    if (form.includes(FORM_TEXT)) {
        Logger.info(`${tag} ${p.target.name} → text`);
        return { kind: 'text' };
    }

    // ================================================================
    // binary → CHAIN 链路规划(收敛 → 解析闸门 → 失败带 feedback 回炉 → 建图)
    // ================================================================
    const extra = `【可用程序清单】\n${p.availablePrograms || '(无,可提名业界成熟工具)'}\n\n【已有文本材料】\n${p.availableTexts || '(无)'}`;

    let feedback = '';
    for (let attempt = 1; attempt <= MAX_LAYER_RETRY + 1; attempt++) {
        const chainDraft0Result = await generateText({
            model: getSmartModel(undefined, ctx),
            instructions: CHAIN_SYSTEM,
            prompt:
                chainUser({
                    target: p.target, goal: p.goal, criteria: p.criteria,
                    availablePrograms: p.availablePrograms || '(无,可提名业界成熟工具)',
                    availableTexts: p.availableTexts || '(无)',
                }) + (feedback ? `\n\n【上一版被拒,必须修正以下问题】\n${feedback}` : ''),
        });

        const chainDraft0 = chainDraft0Result.text;
        Logger.debug(`${tag} 二进制链路草稿(第${attempt}次):`, chainDraft0);

        if (chainDraft0.includes(IMPOSSIBLE_MARK)) {
            return { kind: 'impossible', reason: chainDraft0.replace(IMPOSSIBLE_MARK, '').trim() };
        }

        const chainDraft = await converge({
            facets: CHAIN_FACETS, targetLine, extra,
            draft: chainDraft0, label: `chain[${p.target.name}]`, ctx,
        });
        if (chainDraft.includes(IMPOSSIBLE_MARK)) {
            return { kind: 'impossible', reason: chainDraft.replace(IMPOSSIBLE_MARK, '').trim() };
        }
        ctx.notify(`链路规划:${p.target.name}`, chainDraft);

        const chainResult = await safefmt(chainDraft, Output.object({ schema: ChainSchema }), ctx);
        if (!chainResult.success) {
            feedback = `结构化提取失败,请严格按行格式输出每一步:${chainResult.err}`;
            Logger.warn(`${tag} chain[${p.target.name}] EXTRACT 失败(第${attempt}次): ${chainResult.err}`);
            continue;
        }

        const chain: ChainOut = chainResult.value?.output;
        Logger.debug('链路结果:', JSON.stringify(chain, null, 2));

        const resolveRes = resolveChain(chain, p.target.name);
        if (!resolveRes.ok) {
            feedback = resolveRes.feedback;
            Logger.warn(`${tag} chain[${p.target.name}] 解析闸门拒绝(第${attempt}次):\n${feedback}`);
            continue;
        }

        // 过闸门 → 就地建 DAG 落库
        const id = buildChainDag({ resolved: resolveRes.resolved, target: p.target, goal: p.goal, ctx });
        return { kind: 'dag', id };
    }

    const msg = `链路规划反复不过闸门[${p.target.name}],最后原因:\n${feedback}`;
    Logger.error(msg);
    throwUnprcessable(msg);
}