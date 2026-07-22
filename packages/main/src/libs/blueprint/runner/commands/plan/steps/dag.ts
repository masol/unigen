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
import Fuse from "fuse.js";
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
- **isArray**：true=多条同构数据（列表/清单/集合）；false=单一数据。默认 false。

### 第二步：思维环节清单（再设计节点）

对清单中**每一份非初始成果**，配恰好一个思维环节来产出它。

每项：
- **环节名**（动宾结构）：人类在这步做什么思维活动。宾语必须具体。
- **类型**：从目录选一种 —— ${LOGICAL_NODE_KINDS.join(" / ")}。
- **说明**（CoT 三问）：人类在这步怎么想——
  1. **看什么**：看哪些材料/成果？
  2. **想什么**：脑子里在做什么判断/分析/创作（一个焦点）？
  3. **写什么**：产出什么成果？
- **intent**：用**陈述句**描述"人类在做什么"，**禁止疑问句**。
  - ✗ "如何重组零散信息？"
  - ✓ "将零散信息重组为连贯叙述文本"
- **输入**：引用交付物清单名称。
- **输出**：引用交付物清单名称，**恰好 1 个**。

【反合并铁律】
- 说明里若出现"然后/接着/再/并且"，说明该拆为两步。
- 一个节点**只能做一件事**（一个判断、一个动作），禁止"提取并分类"、"分析并汇总"等合并描述。
- 如果一个节点同时需要多个不同类型的判断（既要分类又要打分又要生成），说明它其实需要拆分。

### 数组 vs 标量规则

每份交付物必须标注 isArray：
- isArray=false（默认）：单一文档/数据
- isArray=true：多条同构数据（列表/清单/集合）

【标量输入 → 数组输出：完全合法】
一个节点从标量输入产出 isArray=true 的输出，这是正常的：
- "从一份创意描述生成多条灵感" → 输入标量，输出 array
- "从一份文档提取多个关键段落" → 输入标量，输出 array
- "规划出多幕剧情细纲" → 输入标量，输出 array
不要因为输入是标量就回避标注输出 isArray=true。关键判据是：输出**本质上是多条同构数据**还是**一份完整文档**。

【自动并行】
- 节点消费 isArray=true 且产出 isArray=true → 系统对每条数据自动并行执行（map）
  你只需描述"处理一条数据"的逻辑。
- 节点消费 isArray=true 且产出 isArray=false → reduce（汇总/合并）

【正确使用 map 语义——禁止为集合中每条数据单开节点】

场景：写三幕小说
✗ 错误设计：
  - 节点"撰写第一幕正文" → 产出"第一幕文稿草案"
  - 节点"撰写第二幕正文" → 产出"第二幕文稿草案"
  - 节点"撰写第三幕正文" → 产出"第三幕文稿草案"

✓ 正确设计：
  - 交付物"幕次写作规划清单"(isArray=true)——每条包含该幕的细纲与上下文
  - 节点"撰写分幕文稿"，消费"幕次写作规划清单"(array)，产出"分幕文稿集"(array)
  - intent="按照细纲和上下文撰写每一幕的正文。顺序执行，参考前一条结果"

场景：为多个维度生成分析
✗ 错误设计：
  - 节点"分析技术维度" → 产出"技术分析稿"
  - 节点"分析市场维度" → 产出"市场分析稿"
  - 节点"分析财务维度" → 产出"财务分析稿"

✓ 正确设计：
  - 交付物"分析维度清单"(isArray=true)——每条指定维度名和分析重点
  - 节点"逐维度撰写分析"，消费"分析维度清单"(array)，产出"各维度分析稿集"(array)

【顺序依赖】
如果数组各元素处理需要"前一条结果"作为上下文（如写续篇需连贯），
在 intent 中注明"顺序执行，参考前一条结果"，系统会标记该节点为串行。

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
- isArray 标注是否合理
- 未识别的 map 语义问题（有专门检查器负责）

【格式】
无问题输出单行：\`PASS\`
有则逐条：\`ISSUE: [位置] [问题] [修正方向]\`
只输出上述格式，不要解释。`;

/**
 * 手动枚举检测器（独立 LLM 调用）
 */
const ENUM_DETECTOR_PROMPT = `你是 DAG 结构缺陷检测器，只负责一个维度：未识别的 map 语义。
【定义】
未识别的 map 语义 = 多个节点执行本质相同的操作逻辑，仅处理对象不同。
这说明设计者未正确使用 isArray：应该有一个 isArray=true 的输入交付物（代表数据集合），
由一个节点统一消费（系统自动对每条数据并行调用），而不是为每条数据单开一个节点。

【识别规则】
找出所有满足以下条件的节点组（≥2 个）：
1. 操作逻辑本质相同（kind 相同或相近，intent 可互相替换——只是主语/宾语换了）
2. 输入数据来自同一批次/可归为同一集合的不同条目
3. 产出结构相同（命名模式或语义结构重复）

【判定示例】
应报告：
- "撰写第一幕" "撰写第二幕" "撰写第三幕" → 同一操作对不同幕
- "分析客户A数据" "分析客户B数据" → 同一分析对不同客户
- "生成摘要-技术" "生成摘要-市场" "生成摘要-财务" → 同一生成对不同维度

不报告：
- "写大纲" "写初稿" "修订" → 操作逻辑不同
- "提取关键词" "统计词频" → kind 不同，操作不同
- 两个节点做相似但不同粒度的事 → 不确定则放过

【输出】
无问题输出单行：PASS
有则逐条：
MAP_MISSING: [节点1, 节点2, ...] — 应将处理对象抽象为 isArray=true 的输入交付物，合并为单个节点消费该输入（输出 isArray 由该节点的语义决定：若仍为集合则 true，若已归约为单一结果则为 false）

只输出上述格式。`;

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

function targetSteps(current: number, mergeRatio: number): number {
    return Math.max(Math.floor(current / mergeRatio), 2);
}

function estimateSteps(procedure: string): number {
    const stepMarkers = procedure.match(/(?:^|\n)\s*(?:\*\*)?步骤\s*\d+/g);
    if (stepMarkers && stepMarkers.length > 0) return stepMarkers.length;
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

/**
 * 程序化检测：去序号匹配
 */
function stripOrdinal(name: string): string {
    return name
        .replace(/第[一二三四五六七八九十百千\d]+[幕章节部分篇条项段落回]/g, '')
        .replace(/part\s*\d+/gi, '')
        .replace(/[Qq]\d+/g, '')
        .replace(/[\d]+/g, '')
        .replace(/[（(]\s*\d+\s*[)）]/g, '')
        .replace(/\s+/g, '')
        .trim();
}

/**
 * 程序化检测：输出 intent 模糊聚类
 */
function detectSemanticEnum(nodes: DagNode[]): string[] {
    const errors: string[] = [];
    const byKind = new Map<string, DagNode[]>();
    for (const n of nodes) {
        const group = byKind.get(n.kind) ?? [];
        group.push(n);
        byKind.set(n.kind, group);
    }

    for (const [kind, group] of byKind) {
        if (group.length < 3) continue;
        const intents = group.map(n => ({
            node: n,
            text: n.outputs[0]?.intent ?? '',
        }));
        const fuse = new Fuse(intents, {
            keys: ['text'],
            threshold: 0.4,
            includeScore: true,
        });
        const clustered = new Set<string>();
        for (const item of intents) {
            if (clustered.has(item.node.name)) continue;
            const hits = fuse.search(item.text)
                .filter(h => (h.score ?? 1) <= 0.4);
            if (hits.length >= 3) {
                const names = hits.map(h => `「${h.item.node.name}」`);
                errors.push(
                    `${names.join("")} 未正确使用 map 语义（kind=${kind}，` +
                    `输出语义高度相似），应合并为单节点，输入改为 isArray=true 的集合交付物，输出 isArray 由语义决定`);
                for (const h of hits) clustered.add(h.item.node.name);
            }
        }
    }
    return errors;
}

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

    // ── isArray 一致性校验 ──────────────────────────────────────────────
    const artMap = new Map<string, Artifact>();
    for (const a of artifacts) artMap.set(a.name, a);

    for (const n of nodes) {
        const outArt = artMap.get(n.outputs[0].name);
        if (!outArt) continue;

        // const allInputsScalar = n.inputs.every(i => artMap.get(i.name)?.isArray === false);
        // if (allInputsScalar && outArt.isArray && n.kind !== 'extract' && n.kind !== 'split') {
        //     errors.push(
        //         `「${n.name}」（kind=${n.kind}）所有输入均为标量但产出 isArray=true，` +
        //         `非 extract/split 节点不能凭空产出数组`);
        // }

        const allInputsArray = n.inputs.length > 0 &&
            n.inputs.every(i => artMap.get(i.name)?.isArray === true);
        if (allInputsArray && outArt.isArray && n.outputs[0].name === n.inputs[0].name) {
            errors.push(
                `「${n.name}」输入输出名相同（${n.outputs[0].name}），` +
                `map 节点必须产生新内容，请重新命名输出`);
        }
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

    // ── 程序化手动枚举检测：策略 A（去序号匹配） ───────────────────────
    const byKindStripped = new Map<string, Map<string, DagNode[]>>();
    for (const n of nodes) {
        const stripped = stripOrdinal(n.name);
        if (!byKindStripped.has(n.kind)) byKindStripped.set(n.kind, new Map());
        const group = byKindStripped.get(n.kind)!.get(stripped) ?? [];
        group.push(n);
        byKindStripped.get(n.kind)!.set(stripped, group);
    }
    for (const [kind, groups] of byKindStripped) {
        for (const [stripped, group] of groups) {
            if (group.length >= 3) {
                const names = group.map(n => `「${n.name}」`);
                errors.push(
                    `${names.join("")} 未正确使用 map 语义（kind=${kind}，去序号后名称相同="${stripped}"），` +
                    `应合并为单节点，输入改为 isArray=true 的集合交付物，输出 isArray 由语义决定`);
            }
        }
    }

    // ── 程序化手动枚举检测：策略 B（语义聚类） ───────────────────────
    const semanticErrors = detectSemanticEnum(nodes);
    errors.push(...semanticErrors);

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

// ─── 手动枚举 LLM 检测（独立并行调用） ────────────────────────────────────

async function detectEnumByLLM(blueprint: string, pctx: PlanContext): Promise<string[]> {
    const { text } = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions: ENUM_DETECTOR_PROMPT,
        prompt: `以下是待检测的工作流蓝图：\n\n${blueprint}`,
    });
    const lines = text.split("\n")
        .map(l => l.trim())
        .filter(l => /^MAP_MISSING:/i.test(l));
    if (lines.length === 0) return [];
    return lines.map(l =>
        `未识别的 map 语义：${l.replace(/^MAP_MISSING:\s*/i, '')}。` +
        `应将处理对象抽象为一个 isArray=true 的交付物（数据集合），用一个节点消费该集合。` +
        `输出侧的 isArray 由该节点的语义决定：若结果仍是多条数据则 isArray=true，若已归约为单一结果则为 false。`
    );
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

        // 并行：可行性评审 + 手动枚举检测
        const [reviewResult, enumResult] = await Promise.all([
            generateText({
                model: getSmartModel(undefined, pctx.ctx),
                instructions: REVIEW_PROMPT,
                prompt: `任务：${task.request}\n\n待评审工作流：${blueprint}`,
            }),
            detectEnumByLLM(blueprint, pctx),
        ]);

        const reviewIssues = reviewResult.text.split("\n")
            .filter(l => /^ISSUE:/i.test(l.trim()));
        const allIssues = [...reviewIssues, ...enumResult];
        if (allIssues.length > 0) {
            refeed(allIssues.join("\n"));
            continue;
        }

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

        // 图校验（含程序化枚举检测）
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

export async function designDag(
    task: DagTask, pctx: PlanContext, hooks: DagHooks = {},
    mergeRatio = 2,
): Promise<DagDesignResult> {
    const originalRequest = task.request;
    const maxLevels = getDetailLevels(pctx.ctx.cmd.args || {});

    Logger.debug(`[dag] 外层 level=${maxLevels}：尝试原始粒度`);
    const firstResult = await innerDesignLoop(task, pctx, hooks);
    if (firstResult) return firstResult;

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

        // 检测 sequential 标记：intent 中含"顺序执行"关键词
        const sequential = /顺序执行/.test(n.intent);

        pnodes.push({
            ...n,
            inputs: norm(n.inputs),
            outputs: norm(n.outputs),
            id: crypto.randomUUID(),
            status: 'pending',
            dag: null,
            error: null,
            facets: {},
            ...(sequential ? { sequential: true } : {}),
        });
    }

    return gdag.createLayer(pnodes, asRoot);
}