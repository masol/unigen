/**
 * ============================================================================
 * 【P-02 · designDag:人类工作流拆解器 + 形式化 DAG 校验】
 * ============================================================================
 * 本设计器的本质:把"人类如何完成这件事"形式化为可执行 DAG。
 *
 * 核心理念:
 *  - 我们不是在设计数据流水线,而是在拆解人类工作流;
 *  - 每个节点 = 人类在某一步做的思维活动(判断/分析/创作/整理...);
 *  - 每个交付物 = 人类完成某步后产出的中间成果;
 *  - 递归展开 = 细化人类思考过程,直到 LLM 能可靠模拟该环节;
 *  - DAG 校验只是脚手架,确保形式化后的流程可执行(能走通);
 *  - 质量维度 = 人类同行如何判断这步做得好不好(为后续改进归因服务)。
 *
 * 单循环:起草 → 评审 → [hooks.review] → 抽取 → 图校验 → [hooks.postCheck]。
 * 任一环失败回喂起草重出。
 */
import { getSmartModel } from "$libs/model/index.js";
import { extractErrmsg, safefmt } from "$libs/model/llm/outline.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import type { PNode } from "$types/index.js";
import {
    Artifact, DagDesignResult, DagNode, Io,
    LOGICAL_NODE_KINDS, NodeListSchema,
} from "$types/shared/plan/nodes.js";
import { generateText, Output, type ModelMessage } from "ai";
import Logger from "electron-log/main.js";
import { DirectedGraph } from "graphology";
import { hasCycle } from "graphology-dag";
import { getDesignRounds } from "../config.js";
import { PlanContext } from "../context.js";

// ─── 共享提示词基座 ────────────────────────────────────────────────────────

const BASE_CONTEXT = `## 你在做什么
你在拆解人类完成某项工作的思维流程,使之可被 LLM 逐环节模拟执行。
目标是:一个人类专家完成这件事时,脑子里分几步想、每步产出什么中间成果——
把这个思维链条形式化出来,最终由 LLM 逐步替代人类的每个思维环节。

## 约束
- 全自动批处理:开始时一次性提供全部材料,结束时得到成果,中途无人参与。
- 需要人实时交互/审批的环节禁止出现;若目标依赖此类环节,写自动化替代或移入范围外。
- 无法以启动材料形式提供的前置条件,写入假设。
- 执行环境(模型选择/性能/存储)由平台承载,不要提及。`;

const BLUEPRINT_FORMAT = `## 蓝图形态(自然语言分节,不输出 JSON)

### 人类工作流拆解

像一个经验丰富的同行那样思考:如果你来完成这件事——
1. 你会先看什么材料?
2. 你脑子里会分几步想?每步在想什么?
3. 每步想完后,你手头多出了什么中间成果?
4. 最后你把哪些中间成果综合为最终交付?

把上面的思考过程写出来。

### 交付物清单(人类每步产出的中间成果)
列出人类在每步思考后产出的中间成果,包括:
- 初始材料(别人给你的)
- 中间成果(你某步想完后产出的)
- 最终交付(你最后给别人的)

每项:
- 名称:脱离上下文可理解。同一份成果全文一个名字。
- 说明:这份成果是什么。
- 质量维度:人类同行如何判断这份成果做得好不好(逗号分隔)。这些维度是"做这步时同时要满足的标准",不为每个维度单开环节。
- 规模:small/medium/large/unbounded。

### 思维环节清单(人类每步的思维活动)
每份非初始成果配恰好一个思维环节来产出它。每项:
- 环节名(动宾结构):人类在这步做什么思维活动。
- 类型:从目录选一种 —— ${LOGICAL_NODE_KINDS.join(" / ")}。
- 说明:人类在这步怎么想——看哪些材料、做什么判断/分析/创作、产出什么。
  【铁律】说明里若出现"然后/接着/再",说明它其实是两步思维,必须拆开。
- 输入:这步需要看哪些材料/成果(引用交付物清单名称)。
- 输出:这步想完后产出什么成果(恰好一份,引用交付物清单名称)。

### 假设
每个非用户明示的决定各记一条。

### 范围外
从目标中拆除的不可自动化部分及原因。

## 规则
- 禁止提问。模糊时按该领域最通行解释推进。
- 步骤数量最小化,能合并的合并。从初始材料必须能走到最终交付。`;

const REVIEW_PROMPT = `你是人类工作流拆解方案的可行性评审器。宽松评审:只拦致命问题。

只检查四点:
1. 断链:某环节引用了清单中不存在的成果?有成果凭空出现无来源?
2. 可达:从初始材料出发,沿思维环节,能否到达最终交付?
3. 无环:是否成环?
4. 人在环:是否有环节需要人实时参与?

措辞模糊/粒度粗/标准不完美——都不是问题,放过。

无问题输出单行:PASS
有则逐条:ISSUE: [位置] [问题] [修正方向]
只输出上述格式。`;

// ─── DagTask ───────────────────────────────────────────────────────────────

export interface DagBoundary {
    availableInputs: Io[];
    outputs: Io[];
}

export interface DagTask {
    roleInstruction: string;
    request: string;
    extraRules: string;
    boundary?: DagBoundary;
}

export interface ReviewFeedback {
    issues: string[];
    mode: 'patch' | 'redesign';
}

export interface DagHooks {
    review?: (blueprint: string) => Promise<ReviewFeedback> | ReviewFeedback;
    postCheck?: (result: DagDesignResult) => Promise<string[]> | string[];
}

/** 顶层任务:从用户描述拆解人类工作流 */
export function makeTopTask(userDesc: string, procedurePrior: string): DagTask {
    const priorBlock = procedurePrior
        ? `\n\n## 参考:人类通常如何处理此类任务(借鉴思路,不必照搬)\n${procedurePrior}`
        : "";
    return {
        roleInstruction:
            `你是人类工作流拆解专家。你的任务是:分析一个人类专家完成目标的思维流程,` +
            `把每步思维活动和中间成果形式化出来。最终这些环节将由 LLM 逐步模拟执行。`,
        request: userDesc + priorBlock,
        extraRules: "",
    };
}

const fmtIoList = (ios: Io[]): string =>
    ios.map(io => `- ${io.name}:${io.intent}`).join("\n");

/**
 * 展开任务:细化人类在某一步的思考过程。
 * "如果人类要从这些材料制作这份成果,他的思维具体分几步?"
 */
export function makeExpandTask(
    node: DagNode,
    upstreamPool: Io[],
    hints?: { complexityReason?: string; priorError?: string | null; procedurePrior?: string },
): DagTask {
    const available: Io[] = [...node.inputs];
    const seen = new Set(available.map(i => i.name));
    for (const io of upstreamPool)
        if (!seen.has(io.name)) { available.push(io); seen.add(io.name); }

    const request = [
        `一个人类专家在做下面这步时,思维跨度太大,LLM 无法一步模拟。`,
        `请细化:这个人具体怎么想?分几步思考?每步产出什么中间成果?`,
        ``,
        `## 要细化的思维环节`,
        `环节:${node.name}`,
        `人类在做什么:${node.intent}`,
        ``,
        `## 这步可以看到的材料(按需取用,不必全用,不可改名)`,
        fmtIoList(available),
        ``,
        `## 这步最终要产出的成果(必须恰好产出,不可改名)`,
        fmtIoList(node.outputs),
        hints?.complexityReason
            ? `\n## 为什么一步做不完(细化应针对性化解)\n${hints.complexityReason}` : "",
        hints?.procedurePrior
            ? `\n## 参考:人类在这一步通常怎么细想\n${hints.procedurePrior}` : "",
        hints?.priorError
            ? `\n## 上一轮细化失败的原因(本轮必须规避)\n${hints.priorError}` : "",
    ].filter(Boolean).join("\n");

    return {
        roleInstruction:
            `你是人类思维过程细化专家。一个人类专家在某步的思维跨度太大,` +
            `你要把他"怎么想"拆解为更细的思维链,每步由 LLM 可靠模拟。`,
        request,
        extraRules: `## 细化边界(硬约束)
- 材料只能从"可以看到的材料"中选,名称一字不改,不可虚构其他材料。
- 最终成果必须恰为任务指定的清单,名称一字不改。
- 交付物清单必须包含实际选用的材料与全部最终成果(照抄名称和说明),中间成果可自由新命名。

## 细化原则
- 想象你在观察一个专家做这步:他先看什么、接着想什么、然后判断什么、最后写出什么。
- 优先拆成可独立思考的分支:各分支只需看部分材料,能并行则并行。
- 每个子环节的思维跨度必须显著小于原环节:禁止换个说法的名义拆分。`,
        boundary: { availableInputs: available, outputs: node.outputs },
    };
}

// ─── 图校验 ────────────────────────────────────────────────────────────────

export function validateNodes(
    artifacts: Artifact[], nodes: DagNode[], boundary?: DagBoundary,
): string[] {
    const errors: string[] = [];

    const artNames = new Set<string>();
    for (const a of artifacts) {
        if (artNames.has(a.name)) errors.push(`成果名重复:「${a.name}」`);
        artNames.add(a.name);
    }

    const nodeNames = new Set<string>();
    for (const n of nodes) {
        if (nodeNames.has(n.name)) errors.push(`环节名重复:「${n.name}」`);
        nodeNames.add(n.name);
    }
    if (errors.length > 0) return errors;

    for (const n of nodes) {
        for (const io of [...n.inputs, ...n.outputs])
            if (!artNames.has(io.name))
                errors.push(`环节「${n.name}」引用了交付物清单中不存在的「${io.name}」`);
    }

    for (const n of nodes)
        if (n.outputs.length !== 1)
            errors.push(`环节「${n.name}」有 ${n.outputs.length} 个输出,违反"一环节一成果"`);

    const producer = new Map<string, string>();
    for (const n of nodes) {
        for (const o of n.outputs) {
            const dup = producer.get(o.name);
            if (dup && dup !== n.name)
                errors.push(`成果「${o.name}」被「${dup}」与「${n.name}」重复产出`);
            producer.set(o.name, n.name);
        }
    }
    if (errors.length > 0) return errors;

    for (const n of nodes) {
        const seen = new Set<string>();
        for (const i of n.inputs) {
            if (seen.has(i.name)) errors.push(`「${n.name}」重复使用「${i.name}」`);
            seen.add(i.name);
        }
        for (const o of n.outputs)
            if (seen.has(o.name))
                errors.push(`「${n.name}」把「${o.name}」同时当输入和输出(自环)`);
    }
    if (errors.length > 0) return errors;

    const boundaryIn = new Set(boundary?.availableInputs.map(i => i.name) ?? []);
    const g = new DirectedGraph();
    for (const n of nodes) g.addNode(n.name);
    for (const n of nodes) {
        for (const i of n.inputs) {
            const from = producer.get(i.name);
            if (!from || from === n.name) {
                if (boundary && !boundaryIn.has(i.name))
                    errors.push(`「${n.name}」的输入「${i.name}」既无产出环节,也不在可用材料中(凭空输入)`);
                continue;
            }
            if (g.hasEdge(from, n.name)) {
                const prev = g.getEdgeAttribute(from, n.name, 'artifacts') as string[];
                g.setEdgeAttribute(from, n.name, 'artifacts', [...prev, i.name]);
            } else {
                g.addEdge(from, n.name, { artifacts: [i.name] });
            }
        }
    }
    if (errors.length > 0) return errors;

    if (hasCycle(g)) return [`思维环节存在循环,请调整输入/输出打破循环`];

    const consumed = new Set<string>();
    for (const n of nodes) for (const i of n.inputs) consumed.add(i.name);
    const terminals: string[] = [];
    for (const n of nodes)
        for (const o of n.outputs)
            if (!consumed.has(o.name)) terminals.push(o.name);

    if (boundary) {
        const want = new Set(boundary.outputs.map(o => o.name));
        for (const t of terminals)
            if (!want.has(t))
                errors.push(`「${t}」是无人使用的终端成果,但不在目标交付中:并入主链或删除`);
        for (const o of boundary.outputs) {
            if (!producer.has(o.name))
                errors.push(`目标交付「${o.name}」没有任何环节产出`);
            else if (consumed.has(o.name))
                errors.push(`目标交付「${o.name}」被后续环节使用,不是终端:交付物必须是流程终点`);
        }
    } else {
        if (terminals.length === 0)
            errors.push(`流程中不存在终端成果:所有输出都被后续使用,没有最终交付`);
        if (terminals.length > 1)
            errors.push(`存在多个终端成果:${terminals.map(t => `「${t}」`).join("、")}。只应有一个最终交付`);
    }

    return errors;
}

// ─── 单循环流水线 ──────────────────────────────────────────────────────────

export async function designDag(
    task: DagTask, pctx: PlanContext, hooks: DagHooks = {},
): Promise<DagDesignResult> {
    const instructions = [
        task.roleInstruction, BASE_CONTEXT, BLUEPRINT_FORMAT, task.extraRules,
    ].filter(Boolean).join("\n\n");

    const messages: ModelMessage[] = [{ role: "user", content: task.request }];
    let lastFeedback = "";
    const rejectedNotes: string[] = [];

    Logger.debug("[plan dag] instructions=", instructions);
    const MAX_DESIGN_ROUNDS = getDesignRounds(pctx.ctx.cmd.args || {});

    for (let round = 1; round <= MAX_DESIGN_ROUNDS; round++) {
        const { text: blueprint } = await generateText({
            model: getSmartModel(),
            instructions,
            messages,
        });
        messages.push({ role: "assistant", content: blueprint });

        const refeed = (feedback: string): void => {
            lastFeedback = feedback;
            Logger.warn(`[plan-dag] 第 ${round} 轮未过:\n${feedback}`);
            messages.push({
                role: "user",
                content: `你的工作流拆解存在以下问题:\n${feedback}\n\n请修正后重新输出完整蓝图。保持无问题部分不变,不要引入新问题。`,
            });
        };

        // 宽松可行性评审
        const { text: review } = await generateText({
            model: getSmartModel(undefined, pctx.ctx),
            instructions: REVIEW_PROMPT,
            prompt: `任务:${task.request}\n\n待评审工作流:\n${blueprint}`,
        });
        const issues = review.split("\n").filter(l => /^ISSUE:/i.test(l.trim()));
        if (issues.length > 0) { refeed(issues.join("\n")); continue; }

        // 定制评审
        if (hooks.review) {
            const fb = await hooks.review(blueprint);
            if (fb.issues.length > 0) {
                if (fb.mode === 'redesign') {
                    lastFeedback = fb.issues.join("\n");
                    rejectedNotes.push(lastFeedback);
                    messages.length = 0;
                    messages.push({
                        role: "user",
                        content: `${task.request}\n\n## 已否决的方案(禁止沿用)\n` +
                            rejectedNotes.map((r, i) => `### 否决 ${i + 1}\n${r}`).join("\n") +
                            `\n\n请用显著不同的思路重新拆解。`,
                    });
                } else {
                    refeed(fb.issues.join("\n"));
                }
                continue;
            }
        }

        // 抽取
        const fmt = await safefmt(blueprint, Output.object({ schema: NodeListSchema }), pctx.ctx);
        if (!fmt.success) {
            const errMsg = extractErrmsg(fmt.err);
            refeed(`工作流无法抽取为结构化清单:\n${errMsg.join("\n")}\n` +
                `请检查交付物清单与思维环节清单是否完整清晰。`);
            continue;
        }

        // 图校验
        const artifacts = fmt.value?.output.artifacts ?? [];
        const nodes = fmt.value?.output.nodes ?? [];
        const errors = validateNodes(artifacts, nodes, task.boundary);
        if (errors.length > 0) {
            refeed(errors.map((e, i) => `${i + 1}. ${e}`).join("\n"));
            continue;
        }

        const result: DagDesignResult = { text: blueprint, artifacts, nodes };

        // 后置检查
        if (hooks.postCheck) {
            const postErrors = await hooks.postCheck(result);
            if (postErrors.length > 0) {
                refeed(postErrors.map((e, i) => `${i + 1}. ${e}`).join("\n"));
                continue;
            }
        }

        return result;
    }

    throwUnprcessable(`工作流拆解失败:${MAX_DESIGN_ROUNDS} 轮后仍未通过。最后反馈:\n${lastFeedback}`);
}

// ─── 登记 ──────────────────────────────────────────────────────────────────

export async function registerLayer(
    result: DagDesignResult, pctx: PlanContext, asRoot: boolean,
): Promise<string> {
    const gdag = pctx.gdag;

    const formalOf = new Map<string, string>();
    for (const a of result.artifacts) {
        const formal = await gdag.registerArtifact(a, pctx.ctx);
        formalOf.set(a.name, formal);
    }

    const pnodes: PNode[] = [];
    for (const n of result.nodes) {
        const norm = (ios: typeof n.inputs) =>
            ios.map(io => ({ ...io, name: formalOf.get(io.name) ?? io.name }));
        pnodes.push({
            ...n,
            inputs: norm(n.inputs),
            outputs: norm(n.outputs),
            id: crypto.randomUUID(),
            status: 'pending',
            dag: null,
            error: null,
            facets: {},
        });
    }

    return gdag.createLayer(pnodes, asRoot);
}