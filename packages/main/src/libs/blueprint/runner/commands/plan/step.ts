/**
 * 单步逆向拆解（X2），用固定棱面 Prism 包裹：
 * X2 草稿 → S2'×4 并发批判 → S3 精炼(≤2轮,二值门+回退)。
 * 单步拆解是同构任务,棱面固定,省掉 prism 的动态拆分(S1)。
 */
import { getSmartModel } from "$libs/model/balancer/get-smart-model.js";
import { NL2Format } from "$libs/model/llm/outline.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { Output } from "ai";
import Logger from "electron-log/main.js";
import pMap from "p-map";
import {
    DECOMPOSE_SYSTEM, decomposeUser,
    FIXED_FACETS,
    STEP_REFINE_SYSTEM,
    stepCritiqueSystem,
    stepCritiqueUser,
    stepRefineUser,
} from "./prompts/index.js";
import {
    DecomposeSchema, StepCritiqueSchema, StepRefineSchema,
    type Decompose, type StepCritique,
} from "./prompts/schemas.js";

const MAX_REFINE_ROUNDS = 2;

export interface TargetDesc { id: string; modality: string; definition: string; }

const targetText = (t: TargetDesc) => `id: ${t.id}\n模态: ${t.modality}\n定义: ${t.definition}`;

export async function decomposeStep(
    target: TargetDesc,
    registrySummary: string,
    sourcesSummary: string,
    ctx?: IRunnerContext,
): Promise<Decompose> {
    const tag = `[loom:decompose:${target.id}]`;

    // 1) X2 草稿
    const draft = await NL2Format({
        model: getSmartModel(undefined, ctx),
        instructions: DECOMPOSE_SYSTEM,
        prompt: decomposeUser(target, registrySummary, sourcesSummary),
        output: Output.object({ schema: DecomposeSchema }),
    });
    Logger.debug(`${tag} draft:\n${JSON.stringify(draft.output, null, 2)}`);
    ctx?.notify(`拆解草稿:${target.id}`, JSON.stringify(draft.output, null, 2));

    // 触底的结果无需精炼
    if (draft.output.is_grounded) return draft.output;

    // 2) S2' 固定棱面并发批判
    let critiques = await critiqueStep(target, draft.output, sourcesSummary, tag, ctx);

    // 3) S3 精炼(≤2轮,二值门+回退)
    let cur = draft.output;
    for (let round = 1; round <= MAX_REFINE_ROUNDS; round++) {
        const r = await NL2Format({
            model: getSmartModel(undefined, ctx),
            instructions: STEP_REFINE_SYSTEM,
            prompt: stepRefineUser(targetText(target), JSON.stringify(cur, null, 2), critiques),
            output: Output.object({ schema: StepRefineSchema }),
        });
        if (!r.output.changed || !r.output.refined?.methods?.length) {
            Logger.debug(`${tag} refine#${round} no-op → 回退保留当前稿`);
            break;
        }
        cur = r.output.refined;
        Logger.debug(`${tag} refine#${round} changelog: ${r.output.changelog.join(" | ")}`);
        ctx?.notify(`拆解精炼#${round}:${target.id}`, r.output.changelog.join(" | "));
        if (round < MAX_REFINE_ROUNDS) {
            critiques = await critiqueStep(target, cur, sourcesSummary, tag, ctx);
        }
    }
    return cur;
}

async function critiqueStep(
    target: TargetDesc, draft: Decompose, sourcesSummary: string,
    tag: string, ctx?: IRunnerContext,
): Promise<StepCritique[]> {
    return pMap(
        FIXED_FACETS,
        async (f) => {
            const c = await NL2Format({
                model: getSmartModel(undefined, ctx),
                instructions: stepCritiqueSystem(f),
                prompt: stepCritiqueUser(targetText(target), sourcesSummary, JSON.stringify(draft, null, 2), f),
                output: Output.object({ schema: StepCritiqueSchema }),
            });
            Logger.debug(`${tag} critique[${f.name}] score=${c.output.score}`);
            return { ...c.output, facet: f.name }; // 回填指派名，防跑偏
        },
        { concurrency: 4 },
    );
}