/**
 * ============================================================================
 * 【P-core · designDag:双层 reAct DAG 设计器】
 * ============================================================================
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
import { getDesignRounds, getDetailLevels } from "../config.js";
import { PlanContext } from "../context.js";

// ─── 提示词 ────────────────────────────────────────────────────────────────

const BASE_CONTEXT = `## 你在做什么
你在拆解人类完成某项工作的思维流程，使之可被 LLM 逐环节模拟执行。
目标是：一个人类专家完成这件事时，脑子里分几步想、每步产出什么中间成果——
把这个思维链条形式化出来，最终由 LLM 逐步替代人类的每个思维环节。

## 约束
- 全自动批处理：开始时一次性提供全部材料，结束时得到成果，中途无人参与。
- 需要人实时交互/审批的环节禁止出现；若目标依赖此类环节，写自动化替代或移入范围外。
- 无法以启动材料形式提供的前置条件，写入假设。
- 执行环境（模型选择/性能/存储）由平台承载，不要提及。`;

/**
 * 蓝图格式提示词
 *
 * 改进要点：
 * 1. 引入"先材料 → 再节点"的 CoT 顺序：
 *    强制 LLM 先把全部材料列齐（包括初始+中间+终态），再设计节点，
 *    避免节点引用了未列出的材料（断链）或凭空产出材料（无来源）。
 * 2. 反合并铁律与 fetchProcedurePrior 对齐：
 *    禁止"然后/接着/再"，禁止一个节点同时做多件事，
 *    这是 DAG 设计阶段"一节点一产出"的同源约束。
 * 3. 显式质量维度引导：
 *    让 LLM 自己反问"人类从哪几个维度判断这步做得好"，
 *    把维度作为节点的 qualityCriteria 字段而非单开节点（避免节点爆炸）。
 * 4. chunk 处理规则内联：
 *    让 LLM 主动设计分块边界，而非后置物理改写。
 */
const BLUEPRINT_FORMAT = `## 蓝图形态（自然语言分节，不输出 JSON）

### 第一步：交付物清单（先列材料）

像一个经验丰富的同行那样思考：如果你来完成这件事——
1. 你会先看什么材料？
2. 你脑子里每一步想完后，手头多出了什么中间成果？
3. 最后你把哪些中间成果综合为最终交付？

把上面三问的所有产物按出现顺序列出（**全部**——包括初始材料、中间成果、最终交付）：

每项：
- **名称**：脱离上下文可理解。同一份成果全文只用一个名字。
- **说明**：这份成果是什么（描述成果本身，不描述怎么得到）。
- **质量维度**：人类同行如何判断这份成果做得好不好（逗号分隔）。
  这些维度是"做产出这一步时同时要满足的标准"，**不为每个维度单开环节**。
- **规模**：small(<1K tokens) / medium(1K-10K) / large(10K-600K) / unbounded(>600K 或条目数不定)。

### 第二步：思维环节清单（再设计节点）

对清单中**每一份非初始成果**，配恰好一个思维环节来产出它。

每项：
- **环节名**（动宾结构）：人类在这步做什么思维活动。宾语必须具体。
- **类型**：从目录选一种 —— ${LOGICAL_NODE_KINDS.join(" / ")}。
- **说明**（CoT 三问）：人类在这步怎么想——
  1. **看什么**：看哪些材料/成果？
  2. **想什么**：脑子里在做什么判断/分析/创作（一个焦点）？
  3. **写什么**：产出什么成果？
- **输入**：引用交付物清单名称。
- **输出**：引用交付物清单名称，**恰好 1 个**。

【反合并铁律】
- 说明里若出现"然后/接着/再/并且"，说明该拆为两步。
- 一个节点**只能做一件事**（一个判断、一个动作），禁止"提取并分类"、"分析并汇总"等合并描述。
- 如果一个节点同时需要多个不同类型的判断（既要分类又要打分又要生成），说明它其实需要拆分。

### 规模处理规则（内联到设计中）

如果某节点输入为 **unbounded**（条目数不定或超大）且输出也为 **large/unbounded**：
- 必须新增一个 chunk 交付物，命名为 \`{原输出名}_chunk_by_{分组维度}\`
- 新增一个 **split** 节点：识别分组规则并切分为 chunks
- 新增一个 **map** 节点：对每个 chunk 独立处理，产出 \`{原输出名}_chunk_results\`
- 下游节点默认消费 chunk_results
- 如果终端交付物需要完整版，新增一个 **reduce** 节点合并所有 chunk_results

### 第三步：假设与范围外

- **假设**：每个非用户明示的决定各记一条。
- **范围外**：从目标中拆除的不可自动化部分及原因。

## 规则
- 禁止提问。模糊时按该领域最通行解释推进。
- 步骤数量最小化，能合并的合并（除非违反反合并铁律）。从初始材料必须能走到最终交付。
- 一个交付物只能被一个节点产出（禁止多节点产出同一份）。
- 每条边上的 artifact 引用必须真实存在于交付物清单中。`;

const REVIEW_PROMPT = `你是人类工作流拆解方案的可行性评审器。**宽松评审：只拦致命问题，不拦风格。**

【只检查四点】
1. **断链**：某环节引用了清单中不存在的成果？有成果凭空出现无来源？
2. **可达**：从初始材料出发，沿思维环节，能否到达最终交付？
3. **无环**：是否成环？
4. **人在环**：是否有环节需要人实时参与（实时审批/对话/确认）？

【以下一律放过，不要报告】
- 措辞模糊、粒度粗细
- 质量维度是否完整
- 命名风格
- 步骤数量多少（除非多到违反"一节点一产出"）
- 节点类型选择是否最优

【格式】
无问题输出单行：\`PASS\`
有则逐条：\`ISSUE: [位置] [问题] [修正方向]\`
只输出上述格式，不要解释。`;

/**
 * 浓缩提示词
 *
 * 改进要点：
 * 1. 保留 DAG 形态约束：每步必须仍是"输入→动作→产出"，不能浓缩为口号。
 * 2. 给出 merge 数量而非目标步数：避免 LLM 自行决定合并强度导致不可控。
 * 3. 强制保留初始和终态：保证可达性。
 */
const CONDENSE_PROMPT = `你是人类工作流浓缩专家。

【任务】将下面的工作流浓缩为更粗粒度的版本。具体规则：
- 每 **${'{merge_ratio}'}** 步原始步骤合并为 1 步
- 合并后每步仍需保持"输入 → 动作 → 产出"三段式结构
- **强制保留**：第一步（最初输入材料）和最后一步（最终交付）
- 合并时把被合并步骤的中间产物**内化为新步骤的内部动作**（不再单独列出）
- 合并后从输入到输出仍必须可达

【原始工作流（${'{current_steps}'} 步）】
${'{procedure}'}

【输出格式】
按顺序列出浓缩后的步骤。每步：

**步骤 N：{动作名}**
- 输入材料：{看哪些}
- 做什么：{合并后的动作描述，可包含原 N 个原子操作}
- 产出：{新增的中间交付物，**仅当前步骤直接产出的那份**}

只输出浓缩后的工作流，不要输出其他内容。`;

/**
 * 块大小与目标步骤映射
 */
function targetSteps(current: number, mergeRatio: number): number {
    return Math.max(Math.floor(current / mergeRatio), 2);
}

function estimateSteps(procedure: string): number {
    // 优先识别"步骤 N："或"**步骤"标记
    const stepMarkers = procedure.match(/(?:^|\n)\s*(?:\*\*)?步骤\s*\d+/g);
    if (stepMarkers && stepMarkers.length > 0) return stepMarkers.length;
    // 兜底：按行匹配步骤性动词
    const lines = procedure.split('\n').filter(l => l.trim().length > 0);
    const verbHints = ['步骤', '环节', '阶段', '产出', '生成', '提取', '分析', '汇总'];
    let count = 0;
    for (const line of lines) {
        if (verbHints.some(v => line.includes(v))) count++;
    }
    return Math.max(count, 1);
}

// ─── DagTask / Hooks ───────────────────────────────────────────────────────

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

export function makeTopTask(userDesc: string, procedurePrior: string): DagTask {
    const priorBlock = procedurePrior
        ? `\n\n## 参考：人类通常如何处理此类任务（借鉴思路，不必照搬）\n${procedurePrior}`
        : "";
    return {
        roleInstruction:
            `你是人类工作流拆解专家。你的任务是：分析一个人类专家完成目标的思维流程，` +
            `把每步思维活动和中间成果形式化出来。最终这些环节将由 LLM 逐步模拟执行。`,
        request: userDesc + priorBlock,
        extraRules: "",
    };
}

const fmtIoList = (ios: Io[]): string =>
    ios.map(io => `- ${io.name}:${io.intent}`).join("\n");

export function makeExpandTask(
    node: DagNode,
    upstreamPool: Io[],
    hints?: { expandReason?: string; priorError?: string | null; procedurePrior?: string },
): DagTask {
    const available: Io[] = [...node.inputs];
    const seen = new Set(available.map(i => i.name));
    for (const io of upstreamPool)
        if (!seen.has(io.name)) { available.push(io); seen.add(io.name); }

    const request = [
        `一个人类专家在做下面这步时，存在成熟的标准工作流，需要细化为子步骤。`,
        `请细化：这个人具体怎么想？分几步思考？每步看什么、想什么、产出什么？`,
        ``,
        `## 要细化的思维环节`,
        `环节：${node.name}`,
        `人类在做什么：${node.intent}`,
        ``,
        `## 这步可以看到的材料（按需取用，不必全用，不可改名）`,
        fmtIoList(available),
        ``,
        `## 这步最终要产出的成果（必须恰好产出，不可改名）`,
        fmtIoList(node.outputs),
        hints?.expandReason
            ? `\n## 为什么需要展开（细化应针对性覆盖）\n${hints.expandReason}` : "",
        hints?.procedurePrior
            ? `\n## 参考：人类在这一步通常怎么细想\n${hints.procedurePrior}` : "",
        hints?.priorError
            ? `\n## 上一轮细化失败的原因（本轮必须规避）\n${hints.priorError}` : "",
    ].filter(Boolean).join("\n");

    return {
        roleInstruction:
            `你是人类思维过程细化专家。一个人类专家在某步有成熟的标准工作流，` +
            `你要把他"怎么想"拆解为更细的思维链，每步由 LLM 可靠模拟。`,
        request,
        extraRules: `## 细化边界（硬约束）
- 材料只能从"可以看到的材料"中选，名称一字不改，不可虚构其他材料。
- 最终成果必须恰为任务指定的清单，名称一字不改。
- 交付物清单必须包含实际选用的材料与全部最终成果（照抄名称和说明），中间成果可自由新命名。

## 细化原则
- 想象你在观察一个专家做这步：他先看什么、接着想什么、然后判断什么、最后写出什么。
- 优先拆成可独立思考的分支：各分支只需看部分材料，能并行则并行。
- 每个子环节的思维跨度必须显著小于原环节：禁止换个说法的名义拆分。`,
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
        if (artNames.has(a.name)) errors.push(`成果名重复：「${a.name}」`);
        artNames.add(a.name);
    }

    const nodeNames = new Set<string>();
    for (const n of nodes) {
        if (nodeNames.has(n.name)) errors.push(`环节名重复：「${n.name}」`);
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
            errors.push(`环节「${n.name}」有 ${n.outputs.length} 个输出，违反"一环节一成果"`);

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
                errors.push(`「${n.name}」把「${o.name}」同时当输入和输出（自环）`);
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
                    errors.push(`「${n.name}」的输入「${i.name}」既无产出环节，也不在可用材料中（凭空输入）`);
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

    if (hasCycle(g)) return [`思维环节存在循环，请调整输入/输出打破循环`];

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
                errors.push(`「${t}」是无人使用的终端成果，但不在目标交付中：并入主链或删除`);
        for (const o of boundary.outputs) {
            if (!producer.has(o.name))
                errors.push(`目标交付「${o.name}」没有任何环节产出`);
            else if (consumed.has(o.name))
                errors.push(`目标交付「${o.name}」被后续环节使用，不是终端：交付物必须是流程终点`);
        }
    } else {
        if (terminals.length === 0)
            errors.push(`流程中不存在终端成果：所有输出都被后续使用，没有最终交付`);
        if (terminals.length > 1)
            errors.push(`存在多个终端成果：${terminals.map(t => `「${t}」`).join("、")}。只应有一个最终交付`);
    }

    return errors;
}

// ─── 工作流浓缩 ────────────────────────────────────────────────────────────

async function condenseProcedure(
    original: string, currentSteps: number, mergeRatio: number, pctx: PlanContext,
): Promise<string> {
    const target = targetSteps(currentSteps, mergeRatio);
    const instructions = CONDENSE_PROMPT
        .replace('{merge_ratio}', String(mergeRatio))
        .replace('{current_steps}', String(currentSteps))
        .replace('{procedure}', original);
    const { text } = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions,
        prompt: `请按规则浓缩上面的工作流。`,
    });
    Logger.debug(`[dag] 浓缩：${currentSteps} 步 → 目标约 ${target} 步（merge=${mergeRatio}）`);
    return text.trim();
}

// ─── 内层 DAG 设计 reAct ──────────────────────────────────────────────────

async function innerDesignLoop(
    task: DagTask, pctx: PlanContext, hooks: DagHooks,
): Promise<DagDesignResult | null> {
    const instructions = [
        task.roleInstruction, BASE_CONTEXT, BLUEPRINT_FORMAT, task.extraRules,
    ].filter(Boolean).join("\n\n");

    const messages: ModelMessage[] = [{ role: "user", content: task.request }];
    const MAX_DESIGN_ROUNDS = getDesignRounds(pctx.ctx.cmd.args || {});

    for (let round = 1; round <= MAX_DESIGN_ROUNDS; round++) {
        const { text: blueprint } = await generateText({
            model: getSmartModel(undefined, pctx.ctx),
            instructions,
            messages,
        });
        messages.push({ role: "assistant", content: blueprint });

        const refeed = (feedback: string): void => {
            Logger.warn(`[dag] 内层第 ${round} 轮未过：\n${feedback}`);
            messages.push({
                role: "user",
                content: `你的工作流拆解存在以下问题：\n${feedback}\n\n请修正后重新输出完整蓝图。保持无问题部分不变，不要引入新问题。`,
            });
        };

        // 宽松可行性评审
        const { text: review } = await generateText({
            model: getSmartModel(undefined, pctx.ctx),
            instructions: REVIEW_PROMPT,
            prompt: `任务：${task.request}\n\n待评审工作流：\n${blueprint}`,
        });
        const issues = review.split("\n").filter(l => /^ISSUE:/i.test(l.trim()));
        if (issues.length > 0) { refeed(issues.join("\n")); continue; }

        // 定制评审
        if (hooks.review) {
            const fb = await hooks.review(blueprint);
            if (fb.issues.length > 0) {
                refeed(fb.issues.join("\n"));
                continue;
            }
        }

        // 抽取
        const fmt = await safefmt(blueprint, Output.object({ schema: NodeListSchema }), pctx.ctx);
        if (!fmt.success) {
            const errMsg = extractErrmsg(fmt.err);
            refeed(`工作流无法抽取为结构化清单：\n${errMsg.join("\n")}\n` +
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

    return null;
}

// ─── 外层粒度控制 ──────────────────────────────────────────────────────────

/**
 * 双层 reAct 入口
 *
 * 外层：内层全失败 → 浓缩工作流 → 重试
 * 内层：生成 → 评审 → 抽取 → validateNodes → 回喂修正
 *
 * @param mergeRatio 每级浓缩的合并比例（2 表示每 2 步合并为 1 步）
 */
export async function designDag(
    task: DagTask, pctx: PlanContext, hooks: DagHooks = {},
    mergeRatio = 2,
): Promise<DagDesignResult> {
    const originalRequest = task.request;
    const maxLevels = getDetailLevels(pctx.ctx.cmd.args || {});

    // 初始尝试（原始粒度）
    Logger.debug(`[dag] 外层 level=${maxLevels}：尝试原始粒度`);
    const firstResult = await innerDesignLoop(task, pctx, hooks);
    if (firstResult) return firstResult;

    // 原始粒度失败，逐级浓缩
    let currentProcedure = originalRequest;
    let currentSteps = estimateSteps(currentProcedure);

    for (let level = maxLevels - 1; level >= 1; level--) {
        currentProcedure = await condenseProcedure(currentProcedure, currentSteps, mergeRatio, pctx);
        currentSteps = estimateSteps(currentProcedure);

        if (currentSteps <= 2) {
            Logger.warn(`[dag] 外层已浓缩到 ${currentSteps} 步（≤2），停止降级`);
            break;
        }

        Logger.debug(`[dag] 外层 level=${level}：尝试 ${currentSteps} 步粒度`);
        const condensedTask = { ...task, request: currentProcedure };
        const result = await innerDesignLoop(condensedTask, pctx, hooks);
        if (result) return result;
    }

    throwUnprcessable(`工作流拆解失败：所有粒度级别（${maxLevels}→1）均未收敛`);
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