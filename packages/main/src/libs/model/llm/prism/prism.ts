import { getSmartModel } from "$libs/model/balancer/get-smart-model.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { generateText, Output } from "ai";
import Logger from "electron-log/main.js";
import pMap from "p-map";
import type { z } from "zod";
import { NL2Format } from "../outline.js";
import {
    critiqueSystem,
    critiqueUser,
    REFINE_SYSTEM,
    refineUser,
    SPLIT_SYSTEM,
    splitUser,
} from "./prompts.js";
import {
    CritiqueSchema,
    FacetsSchema,
    RefineSchema,
    type Critique,
    type Facet,
} from "./schemas.js";

/** safefmt：与 generateText 同款接口，额外带 schema；内部自由生成后按 schema 提取。 */
export type SafeFmt = <S extends z.ZodType>(opts: {
    system: string;
    prompt: string;
    schema: S;
}) => Promise<{ text: string; object: z.infer<S> }>;

export interface PrismOpts {
    maxFacets?: number; // 硬上限 5
    maxRefineRounds?: number; // 硬上限 2
    kind?: string; // 仅留痕,用于日志记录。
}

/** 返回值与 generateText 对齐：调用方拿 .text 即可。 */
export interface PrismTextResult {
    text: string;
}

const HARD_MAX_FACETS = 5;
const HARD_MAX_ROUNDS = 2;

function normalizeName(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
}

/**
 * prism：把任意"生成一次答案"升级为
 * 草稿 → 棱面拆分 → 分面批判 → 合并精炼 的多棱面自省。
 * 通用推理外壳，对"怎么生成初稿"保持中立。是反思回路，不是 ReAct（无外部动作）。
 * 输出与 generateText 一致（{ text }）；draft / 理由 / 批判 / 改动全走 logger.debug。
 */
export async function prism(
    query: string,
    opts?: PrismOpts,
    ctx?: IRunnerContext
): Promise<PrismTextResult> {
    const log = Logger.debug;
    const tag = opts?.kind ? `[prism:${opts.kind}]` : "[prism]";
    const maxFacets = Math.min(opts?.maxFacets ?? HARD_MAX_FACETS, HARD_MAX_FACETS);
    const maxRounds = Math.min(opts?.maxRefineRounds ?? HARD_MAX_ROUNDS, HARD_MAX_ROUNDS);

    // 1) 草稿
    const draft = await generateText({
        model: getSmartModel(undefined, ctx),
        prompt: query
    });
    log(`${tag} draft:\n${draft.text}`);
    ctx?.notify("首轮草稿", draft.text);

    // 2) 棱面拆分（≤maxFacets，代码层归一化去重）
    const split = await NL2Format({
        model: getSmartModel(),
        instructions: SPLIT_SYSTEM,
        prompt: splitUser(query, draft.text),
        output: Output.object({ schema: FacetsSchema }),
    });
    log(`${tag} split reasoning:\n${JSON.stringify(split.output)}`);

    const seen = new Set<string>();
    const facets: Facet[] = [];
    for (const f of split.output.facets) {
        const name = normalizeName(f.name);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        facets.push({ ...f, name });
        if (facets.length >= maxFacets) break;
    }
    log(`${tag} facets: ${facets.map((f) => f.name).join(", ")}`);
    ctx?.notify("视角信息", JSON.stringify(split.output, null, 2) + '\n' + facets.map((f) => f.name).join(", "))

    // 3) 分面批判（各棱面独立、并发；都看到原始 query）
    let critiques = await critiqueAll(query, draft.text, facets, tag, ctx);

    // 4) 合并精炼（≤maxRounds，二值门 + 回退）
    let cur = draft.text;
    for (let round = 1; round <= maxRounds; round++) {
        const r = await NL2Format({
            model: getSmartModel(undefined, ctx),
            instructions: REFINE_SYSTEM,
            prompt: refineUser(query, cur, critiques),
            output: Output.object({ schema: RefineSchema }),
        });
        log(`${tag} refine#${round} reasoning:\n${r.output}`);
        ctx?.notify(`第${round}轮改进`, JSON.stringify(r.output, null, 2))

        const next = r.output.refined_artifact?.trim();
        // 二值门：没改好（未改 / 产物空 / 与当前稿相同）就停 + 回退保留上一版
        if (!r.output.changed || !next || next === cur) {
            log(`${tag} refine#${round} no-op → 回退保留当前稿`);
            break;
        }
        cur = next;
        log(`${tag} refine#${round} changelog: ${r.output.changelog.join(" | ")}`);
        ctx?.notify(`第${round}轮改进日志`, r.output.changelog.join(" | "))

        if (round < maxRounds) {
            critiques = await critiqueAll(query, cur, facets, tag, ctx);
        }
    }

    log(`${tag} changed=${cur !== draft.text}`);
    return { text: cur };
}

async function critiqueAll(
    query: string,
    artifact: string,
    facets: Facet[],
    tag: string,
    ctx?: IRunnerContext
): Promise<Critique[]> {
    const critiques = await pMap(
        facets,
        async (f) => {
            const c = await NL2Format({
                model: getSmartModel(undefined, ctx),
                instructions: critiqueSystem(f),
                prompt: critiqueUser(query, artifact, f),
                output: Output.object({ schema: CritiqueSchema }),
            });
            Logger.debug(`${tag} critique[${f.name}] reasoning:\n${c.output}`);
            return { ...c.output, facet: f.name }; // 回填指派名，防跑偏
        },
        {
            concurrency: 8
        }
    );
    return critiques;
}