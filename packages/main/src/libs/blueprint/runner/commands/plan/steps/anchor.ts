/**
 * ============================================================================
 * 【P-21a · 需求抽取】—— 已实现
 * ============================================================================
 * DRAFT(自然语言) → 缺失哨兵检查(代码抛错,严格要求用户提供输入与输出)
 * → for 收敛[3棱面并发批判→精炼],全棱面无问题提前跳出 → EXTRACT(唯一 JSON)。
 * 无 ASSUME:系统不替用户假设输入,缺什么让用户补什么(质量优先,错误挡在门外)。
 */
import { getSmartModel } from '$libs/model/balancer/get-smart-model.js';
import { safefmt } from '$libs/model/llm/outline.js';
import { throwUnprcessable } from '$libs/utils/err.js';
import type { IRunnerContext } from '$types/blueprint/context.js';
import { generateText, Output } from 'ai';
import Logger from 'electron-log/main.js';
import pMap from 'p-map';
import { CRITIQUE_CONCURRENCY, getRefineRounds, MISSING_MARK, NO_ISSUE_MARK } from '../config.js';
import {
    ANCHOR_DRAFT_SYSTEM,
    ANCHOR_FACETS,
    ANCHOR_REFINE_SYSTEM,
    anchorDraftUser,
    anchorRefineUser,
    AnchorSchema,
    facetCritiqueSystem, facetCritiqueUser,
    type AnchorOut
} from '../prompts/anchor.js';

const tag = '[plan:extract]';


/** 截取五节稿中某节(仅用于哨兵检查,不参与内容加工) */
function section(draft: string, title: string): string {
    const m = draft.match(new RegExp(`##\\s*${title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`));
    return (m?.[1] ?? '').trim();
}

export async function extractRequirement(body: string, ctx: IRunnerContext): Promise<AnchorOut> {
    // ---- 1) DRAFT ----
    const result = await generateText({
        model: getSmartModel(undefined, ctx),
        instructions: ANCHOR_DRAFT_SYSTEM,
        prompt: anchorDraftUser(body),
        temperature: 0
    });

    let draft = result.text;
    Logger.debug(`${tag} draft:\n${draft}`);

    // ---- 2) 哨兵检查(代码抛错):严格要求用户提供输入与输出 ----
    if (section(draft, '输出').includes(MISSING_MARK)) {
        const msg = '未说明要产出什么。请补充最终交付物,例如:"…生成一份产品推广文案"。';
        Logger.error(msg)
        throwUnprcessable(msg);
    }
    if (section(draft, '输入').includes(MISSING_MARK)) {
        const msg = '未说明提供什么素材。请补充输入,例如:"根据这份产品说明书…"。';
        throwUnprcessable(msg);
    }
    ctx.notify('需求整理稿', draft);

    // ---- 3) for 收敛:3 棱面并发批判 → 精炼,全棱面无问题提前跳出 ----
    const refineRounds = getRefineRounds(ctx);
    for (let round = 1; round <= refineRounds; round++) {
        const critiques = (
            await pMap(
                ANCHOR_FACETS,
                async (f) => {
                    const result = await generateText({
                        model: getSmartModel(undefined, ctx),
                        instructions: facetCritiqueSystem(f),
                        prompt: facetCritiqueUser({ body, draft, facetName: f.name }),
                    });
                    return {
                        facet: f.name,
                        text: result.text,
                    }
                },
                { concurrency: CRITIQUE_CONCURRENCY },
            )
        ).filter((c) => !c.text.includes(NO_ISSUE_MARK));

        if (critiques.length === 0) {
            Logger.debug(`${tag} 第${round}轮全棱面无问题,收敛`);
            break;
        }

        const refineResult = await generateText({
            model: getSmartModel(undefined, ctx),
            instructions: ANCHOR_REFINE_SYSTEM,
            prompt: anchorRefineUser({ body, draft, critiques }),
        });

        draft = refineResult.text;
        Logger.debug(`${tag} refined#${round}:\n${draft}`);

        // 精炼后复查哨兵:修订不许脑补,也不许把已有内容改丢
        if (section(draft, '输出').includes(MISSING_MARK) || section(draft, '输入').includes(MISSING_MARK)) {
            const msg = '需求中输入/输出信息不明确,请更具体地描述素材与交付物。';
            Logger.error(msg);
            throwUnprcessable(msg);
        }
    }

    // ---- 4) EXTRACT:唯一的 JSON 提取(只转格式,不再判断) ----
    const extractResult = await safefmt(draft, Output.object({ schema: AnchorSchema }), ctx);
    const out = extractResult.value?.output;
    if (!extractResult || !extractResult.success || !out) {
        const msg = `无法提取结构化的目标信息：${extractResult.err}`;
        Logger.error(msg)
        throwUnprcessable(msg);
    }

    // ---- 5) 结构兜底(最后防线,与 LLM 表述无关) ----
    if (out.inputs.length === 0 || out.outputs.length === 0) {
        const msg = '未能确定输入或输出,请重新描述你的要求。';
        Logger.error(msg);
        throwUnprcessable(msg);
    }

    Logger.info(`${tag} 完成: in=${out.inputs.length} out=${out.outputs.length} criteria=${out.criteria.length}`);
    return out;
}