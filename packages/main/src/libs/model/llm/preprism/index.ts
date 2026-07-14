import { getSmartModel } from "$libs/model/balancer/get-smart-model.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { generateText, Output } from "ai";
import Logger from "electron-log/main.js";
import pMap from "p-map";
import { NL2Format } from "../outline.js";
import {
    ANALYZE_SYSTEM,
    analyzeUser,
    critiqueSystem,
    critiqueUser,
    REFINE_SYSTEM,
    refineUser,
} from "./prompts.js";
import {
    AnalysisSchema,
    CritiqueSchema,
    RefineSchema,
    type Critique,
    type Dimension,
} from "./schemas.js";
import { buildAnswerSystem } from "./system-template.js";

export interface PreprismOpts {
    maxDimensions?: number; // 硬上限 5
    kind?: string; // 仅留痕,用于日志记录。
}

/** 返回值与 generateText 对齐：调用方拿 .text 即可。 */
export interface PreprismTextResult {
    text: string;
}

const HARD_MAX_DIMENSIONS = 5;

function normalizeName(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
}

/**
 * preprism：先侦察、再作答、评一轮。
 * 分析用户输入 → 拆维度并收集术语/最佳方法 → 组装动态系统提示词 →
 * 带着专家人设生成草稿 → 分维批判 + 精炼各一次。
 *
 * 与 prism 的区别：prism 把功夫花在"答完之后"（多轮批判精炼），
 * preprism 把功夫花在"动笔之前"（让草稿本身就站在专家视角），因此收尾只需一轮。
 * 动态系统提示词由代码模板组装，LLM 只提供结构化情报，不直接写提示词。
 * 输出与 generateText 一致（{ text }）；中间产物走 Logger.debug 与 ctx.notify。
 */
export async function preprism(
    query: string,
    opts?: PreprismOpts,
    ctx?: IRunnerContext
): Promise<PreprismTextResult> {
    const log = Logger.debug;
    const tag = opts?.kind ? `[preprism:${opts.kind}]` : "[preprism]";
    const maxDims = Math.min(
        opts?.maxDimensions ?? HARD_MAX_DIMENSIONS,
        HARD_MAX_DIMENSIONS
    );

    // 1) 问题侦察：领域、维度、术语、最佳方法、坑
    const analyzed = await NL2Format({
        model: getSmartModel(undefined, ctx),
        instructions: ANALYZE_SYSTEM,
        prompt: analyzeUser(query),
        output: Output.object({ schema: AnalysisSchema }),
    });
    log(`${tag} analysis:\n${JSON.stringify(analyzed.output)}`);

    // 维度归一化去重 + 截断（与分析结果一起构成动态提示词的原料）
    const seen = new Set<string>();
    const dimensions: Dimension[] = [];
    for (const d of analyzed.output.dimensions) {
        const name = normalizeName(d.name);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        dimensions.push({ ...d, name });
        if (dimensions.length >= maxDims) break;
    }
    const analysis = { ...analyzed.output, dimensions };
    ctx?.notify(
        "问题侦察",
        JSON.stringify(analysis, null, 2) + "\n" + dimensions.map((d) => d.name).join(", ")
    );

    // 2) 组装动态系统提示词（固定模板 + 结构化情报，代码侧完成）
    const answerSystem = buildAnswerSystem(analysis);
    log(`${tag} dynamic system:\n${answerSystem}`);
    ctx?.notify("动态系统提示词", answerSystem);

    // 3) 带专家人设生成草稿
    const draft = await generateText({
        model: getSmartModel(undefined, ctx),
        system: answerSystem,
        prompt: query,
    });
    log(`${tag} draft:\n${draft.text}`);
    ctx?.notify("专家草稿", draft.text);

    // 4) 分维批判（各维度独立、并发；都看到原始 query）
    const critiques = await critiqueAll(query, draft.text, dimensions, tag, ctx);

    // 5) 精炼（仅一轮，二值门 + 回退）
    let cur = draft.text;
    const r = await NL2Format({
        model: getSmartModel(undefined, ctx),
        instructions: REFINE_SYSTEM,
        prompt: refineUser(query, cur, critiques),
        output: Output.object({ schema: RefineSchema }),
    });
    log(`${tag} refine reasoning:\n${JSON.stringify(r.output)}`);
    ctx?.notify("精炼结果", JSON.stringify(r.output, null, 2));

    const next = r.output.refined_artifact?.trim();
    // 二值门：没改好（未改 / 产物空 / 与草稿相同）就回退保留草稿
    if (r.output.changed && next && next !== cur) {
        cur = next;
        log(`${tag} changelog: ${r.output.changelog.join(" | ")}`);
        ctx?.notify("改进日志", r.output.changelog.join(" | "));
    } else {
        log(`${tag} refine no-op → 保留草稿`);
    }

    log(`${tag} changed=${cur !== draft.text}`);
    return { text: cur };
}

async function critiqueAll(
    query: string,
    artifact: string,
    dimensions: Dimension[],
    tag: string,
    ctx?: IRunnerContext
): Promise<Critique[]> {
    const critiques = await pMap(
        dimensions,
        async (d) => {
            const c = await NL2Format({
                model: getSmartModel(undefined, ctx),
                instructions: critiqueSystem(d),
                prompt: critiqueUser(query, artifact, d),
                output: Output.object({ schema: CritiqueSchema }),
            });
            Logger.debug(
                `${tag} critique[${d.name}] reasoning:\n${JSON.stringify(c.output)}`
            );
            return { ...c.output, dimension: d.name }; // 回填指派名，防跑偏
        },
        {
            concurrency: 8,
        }
    );
    ctx?.notify(
        "分维批判",
        critiques
            .map(
                (c) =>
                    `【${c.dimension}｜${c.score}/10】问题：${c.issues.length ? c.issues.join("；") : "（无）"
                    }`
            )
            .join("\n")
    );
    return critiques;
}