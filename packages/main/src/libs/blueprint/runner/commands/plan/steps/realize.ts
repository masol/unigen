/**
 * ============================================================================
 * 【P-22a · 实现路径判定(形态分流+链路规划版)】
 * ============================================================================
 * FORM(单次分类,判据:LLM 原始输出能否直接是该文件) →
 *   text   → COMPOSE 收敛 → direct | parts 入图(文本侧递归);
 *   binary → CHAIN 收敛 → 程序调用图 + 纯文本输入清单(文本输入回文本侧递归,
 *            链路图经代码确定性校验:每步输入可解析/末步产出即目标);
 *   other  → impossible(调用方按 blocked 处理)。
 */
import { getSmartModel } from '$libs/model/balancer/get-smart-model.js';
import { safefmt } from '$libs/model/llm/outline.js';
import { throwUnprcessable } from '$libs/utils/err.js';
import type { IRunnerContext } from '$types/blueprint/context.js';
import { generateText, Output } from 'ai';
import Logger from 'electron-log/main.js';
import pMap from 'p-map';
import { CRITIQUE_CONCURRENCY, DEF_REFINE_ROUNDS, FORM_BINARY, FORM_OTHER, FORM_TEXT, NO_ISSUE_MARK } from '../config.js';
import type { TermType } from '../prompts/anchor.js';
import {
    CHAIN_FACETS,
    CHAIN_SYSTEM,
    ChainSchema,
    chainUser,
    COMPOSE_FACETS,
    COMPOSE_SYSTEM,
    ComposeOut,
    ComposeSchema,
    composeUser,
    DIRECT_MARK,
    FORM_SYSTEM,
    formUser,
    IMPOSSIBLE_MARK,
    REALIZE_REFINE_SYSTEM,
    realizeCritiqueSystem, realizeCritiqueUser,
    realizeRefineUser,
    type ChainOut
} from '../prompts/realize.js';

const tag = '[plan:realize]';

/** 判定结果:四种出路 */
export type RealizeResult =
    | { kind: 'direct' }                                               // 一体成文,LLM 一步可写
    | { kind: 'compose'; parts: TermType[]; assembly: string }         // 文本复合,parts 入图递归
    | { kind: 'chain'; chain: ChainOut }                               // 二进制链路,text_inputs 入图递归
    | { kind: 'impossible'; reason: string };                          // 阻塞,调用方标 blocked

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
    for (let round = 1; round <= DEF_REFINE_ROUNDS; round++) {
        const critiques = (
            await pMap(
                p.facets,
                async (f) => {
                    const textResult = await generateText({
                        model: getSmartModel(undefined, p.ctx),
                        instructions: realizeCritiqueSystem(f),
                        prompt: realizeCritiqueUser({ targetLine: p.targetLine, extra: p.extra, draft, facetName: f.name }),
                    });
                    Logger.debug("converge评审结果：", textResult.text)
                    return {
                        facet: f.name,
                        text: textResult.text,
                    }
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

/** 链路图确定性校验(代码,免费):每步输入可解析 + 无环引用 + 末步产出即目标 */
function validateChain(chain: ChainOut, targetName: string): string[] {
    const errors: string[] = [];
    if (chain.steps.length === 0) {
        return ['调用序列为空'];
    }
    const textNames = new Set(chain.text_inputs.map((t) => t.name));
    const produced = new Set<string>();
    chain.steps.forEach((s, i) => {
        for (const input of s.inputs) {
            // 每步输入必须可解析:要么是外部文本输入,要么是更早步骤的产出
            if (!textNames.has(input) && !produced.has(input)) {
                errors.push(`第${i + 1}步输入「${input}」无来源:既不在文本输入清单,也非更早步骤的产出`);
            }
        }
        if (produced.has(s.output_name)) {
            errors.push(`产出「${s.output_name}」被多个步骤重复产出`);
        }
        produced.add(s.output_name);
    });
    // 末步产出即目标(名称级比对;名称经同一份稿件产生,一致性可要求)
    const last = chain.steps[chain.steps.length - 1];
    if (last.output_name !== targetName) {
        errors.push(`末步产出「${last.output_name}」不是目标交付物「${targetName}」`);
    }
    // 文本输入清单无冗余:每项都被至少一步引用
    const usedInputs = new Set(chain.steps.flatMap((s) => s.inputs));
    for (const t of chain.text_inputs) {
        if (!usedInputs.has(t.name)) errors.push(`文本输入「${t.name}」未被任何步骤引用`);
    }
    return errors;
}

export async function realizeStep(p: {
    target: TermType;
    goal: string;
    criteria: string[];
    availablePrograms: string;   // 已登记程序能力摘要;无则空串
    availableTexts: string;      // 已有文本材料摘要(name｜intent 行);无则空串
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
        temperature: 0
    });

    let form = formResult.text;
    if (![FORM_TEXT, FORM_BINARY, FORM_OTHER].some((m) => form.includes(m))) {
        Logger.warn(`${tag} FORM 输出无哨兵,重试一次: ${form.slice(0, 80)}`);
        const formResult = await generateText({
            model: getSmartModel(undefined, ctx),
            instructions: FORM_SYSTEM,
            prompt: formUser(p.target),
            temperature: 0
        });
        form = formResult.text;
    }
    Logger.info(`${tag} FORM[${p.target.name}] → ${form.trim().slice(0, 40)}`);

    // ---- other:不是数字文件,无法实现 ----
    if (form.includes(FORM_OTHER)) {
        const msg = `非数字交付物,无法由本系统产出: ${p.target.name}`;
        Logger.error(msg);
        throwUnprcessable(msg);
    }

    // ================================================================
    // 分流一:text → COMPOSE 成分拆解
    // ================================================================
    if (form.includes(FORM_TEXT)) {
        const draft0Result = await generateText({
            model: getSmartModel(undefined, ctx),
            instructions: COMPOSE_SYSTEM,
            prompt: composeUser(p)
        });

        const draft0 = draft0Result.text;

        // 一体成文速判:草稿即 direct,不进收敛(单一判断,剖面无可批)
        if (draft0.includes(DIRECT_MARK)) {
            Logger.info(`${tag} ${p.target.name} → direct(一体成文)`);
            return { kind: 'direct' };
        }

        const draft = await converge({
            facets: COMPOSE_FACETS, targetLine, extra: '(无)',
            draft: draft0, label: `compose[${p.target.name}]`, ctx,
        });

        // 收敛后可能被"拆分判断正确性"剖面纠正为 direct
        if (draft.includes(DIRECT_MARK)) {
            Logger.info(`${tag} ${p.target.name} → direct(收敛后判定)`);
            return { kind: 'direct' };
        }
        ctx.notify(`成分拆解:${p.target.name}`, draft);

        const outResult = await safefmt(draft, Output.object({ schema: ComposeSchema }), ctx);

        if (!outResult.success) {
            const msg = `无法提取格式：${outResult.err}`
            Logger.error(msg);
            throwUnprcessable(msg);
        }

        const out: ComposeOut = outResult.value?.output;

        if (out.parts.length === 0) {
            const msg = `拆解矛盾:${p.target.name} 非一体成文,却未拆出任何部分`;
            Logger.error(msg);
            throwUnprcessable(msg);
        }
        Logger.info(`${tag} ${p.target.name} → compose: [${out.parts.map((x) => x.name).join(', ')}]`);
        return { kind: 'compose', parts: out.parts, assembly: out.assembly };
    }

    // ================================================================
    // 分流二:binary → CHAIN 链路规划
    // ================================================================
    const extra = `【可用程序清单】\n${p.availablePrograms || '(无,可提名业界成熟工具)'}\n\n【已有文本材料】\n${p.availableTexts || '(无)'}`;
    const chainDraft0Result = await generateText({
        model: getSmartModel(undefined, ctx),
        instructions: CHAIN_SYSTEM,
        prompt: chainUser({
            target: p.target, goal: p.goal, criteria: p.criteria,
            availablePrograms: p.availablePrograms || '(无,可提名业界成熟工具)',
            availableTexts: p.availableTexts || '(无)',
        })
    });

    const chainDraft0 = chainDraft0Result.text;
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
        const msg = `无法提取格式：${chainResult.err}`
        Logger.error(msg);
        throwUnprcessable(msg);
    }

    const chain: ChainOut = chainResult.value?.output;

    Logger.debug("链路结果:", JSON.stringify(chain, null, 2));

    // ---- 链路图确定性校验(代码闸门):不过则抛错,调用方按重试/blocked 处理 ----
    const errors = validateChain(chain, p.target.name);
    if (errors.length > 0) {
        throw new Error(`链路校验失败[${p.target.name}]: ${errors.join('; ')}`);
    }

    Logger.info(
        `${tag} ${p.target.name} → chain: ${chain.steps.map((s) => s.program).join(' → ')} | 文本输入:[${chain.text_inputs.map((t) => t.name).join(', ')}]`,
    );
    return { kind: 'chain', chain };
}