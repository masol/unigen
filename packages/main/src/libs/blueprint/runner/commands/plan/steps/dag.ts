/**
 * ============================================================================
 * 【P-02 · designDag：通用 DAG 设计器 + 顶层任务】(原 srs 步骤的替代)
 * ============================================================================
 * 单循环：起草 → 宽松评审 → safefmt 直接抽取 → 代码图校验。
 * 四环中任何一环失败，反馈全部回喂【起草对话】重出蓝图——设计错误只有
 * 重设计能修，抽取器修不了，所以不存在独立的"提取重试循环"。
 *
 * 抽取无提示词：蓝图原文直接进 safefmt(NodeListSchema)。模型原生 JSON
 * 输出优先，无则由 safefmt 退化为 schema 提示词抽取——schema 的
 * description 就是抽取指令(见 schema/node.ts)。
 *
 * DagTask 是提示词组装载体：共享背景基座 + 任务专属指引。
 * 当前实现 makeTopTask(用户描述→顶层)；未来 makeRefineTask(矛盾回喂
 * 重设计)、makeExpandTask(从某节点 io 深入一层) 只换 task 构造器，
 * 流水线与代码校验原样复用。
 */
import { getSmartModel } from "$libs/model/index.js";
import { extractErrmsg, safefmt } from "$libs/model/llm/outline.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { generateText, Output, type ModelMessage } from "ai";
import Logger from "electron-log/main.js";
import { DirectedGraph } from "graphology";
import { hasCycle } from "graphology-dag";
import { MAX_DESIGN_ROUNDS } from "../config.js";
import { PlanContext } from "../context.js";
import { type PNode } from "../graph/gdag.js";
import { DagDesignResult, NodeListSchema, type DagNode } from "../schema/node.js";

// ─── 提示词组装：共享基座 ─────────────────────────────────────────────────

/** 执行背景：所有层级共享。描述方案可行域 */
const BASE_CONTEXT = `## 方案可行域(用于过滤，禁止复述进输出)
- 最终方案是一个全自动批处理任务：开始时一次性提供全部初始数据(含一切参数性
  输入，不区分"数据"与"配置")，结束时获得交付物。中途无人参与。
- 任何需要人实时交互、审批、多轮对话的环节，禁止出现；若目标依赖此类环节，
  写其可自动化替代方案，或移入范围外。
- 无法以启动时数据形式提供的前置条件，写入假设。
- 性能、安全、存储、模型/工具选择、界面、监控等全部由运行平台承载，不要提及。`;
/** 蓝图形态：所有层级共享。自然语言分节，无编号、无 JSON */
const BLUEPRINT_FORMAT = `## 蓝图形态(自然语言分节，不要输出 JSON)
### 数据产物清单
列出全部数据：初始提供的、中间产生的、最终交付的。每项一行：
- 名称：这份数据是什么、为何存在。名称可自创词汇，但脱离上下文必须可理解，
  同一份数据全文只用一个名字。
### 加工节点清单
每个节点一行：
- 节点名(动宾结构)：把哪些输入变成哪些输出、为什么。只写做什么，不写怎么做。
  输入/输出必须使用数据产物清单中的名称。
### 假设
每个非用户明示的决定(交付物形态、范围取舍、质量取向)各记一条。
### 范围外
从目标中拆除的不可自动化部分及原因。

## 规则
- 禁止提问。目标模糊时采用该领域最通行的解释推进。
- 节点数量最小化，可合并的合并。图必须能从初始数据走到最终交付物。`;

/** 宽松评审：所有层级共享。只拦致命伤 */
const REVIEW_PROMPT = `你是数据加工蓝图的可行性评审器。这是宽松评审：
只拦截让图根本无法执行的致命问题，不追求完美。

只检查以下四点：
1. 断链：节点是否引用了清单中不存在的数据？是否有产物凭空出现没有来源？
2. 可达：从初始数据出发，沿节点加工，能否到达最终交付物？
3. 无环：加工关系是否成环？
4. 人在环：是否有环节需要人实时参与(交互/审批/多轮对话)？

措辞含糊、粒度粗、质量标准不完美——这些都【不是】问题，一律放过。

如果没有致命问题，输出单行：PASS
如果存在致命问题，按以下格式逐条输出：
ISSUE: [位置] [问题] [修正方向]
只输出上述格式，不要添加任何额外说明。`;

// ─── DagTask：任务描述载体(未来 refine/expand 只换这里) ───────────────────

export interface DagTask {
    /** 任务专属指引，与共享基座组装成完整提示词 */
    roleInstruction: string;
    /** 起草的初始用户消息 */
    request: string;
    /** 附加约束(如子层展开时锁死边界 io)；无则空字符串 */
    extraRules: string;
}

/** 顶层任务：从用户描述设计根 DAG */
export function makeTopTask(userDesc: string): DagTask {
    return {
        roleInstruction: `你是数据加工蓝图设计器。把用户目标设计为一条数据处理流水线的蓝图。
唯一消费者是下游的自动化程序。无人阅读你的输出。`,
        request: userDesc,
        extraRules: "",
    };
}

/*
 * @todo makeRefineTask(node, error)：矛盾回喂重设计——request 为原蓝图+矛盾描述；
 * @todo makeExpandTask(node)：深入一层——request 为父节点 intent，extraRules
 *       锁死边界：初始数据必须恰为父节点 inputs，最终交付物必须恰为父节点 outputs。
 */

// ─── 代码校验：连边推导 + 图合规。无编号，一切以名称对账 ──────────────────

export function validateNodes(nodes: DagNode[]): string[] {
    const errors: string[] = [];

    // 名称唯一性(名称即身份，重名即身份冲突，短路)
    const nodeNames = new Set<string>();
    for (const n of nodes) {
        if (nodeNames.has(n.name)) errors.push(`节点名重复：「${n.name}」`);
        nodeNames.add(n.name);
    }
    const producer = new Map<string, string>(); // artifact → node.name
    for (const n of nodes) {
        for (const o of n.outputs) {
            const dup = producer.get(o.name);
            if (dup && dup !== n.name)
                errors.push(`数据「${o.name}」被「${dup}」与「${n.name}」重复产出，同一数据只能有一个产出者`);
            producer.set(o.name, n.name);
        }
    }
    if (errors.length > 0) return errors;

    // 局部合法性
    for (const n of nodes) {
        const seen = new Set<string>();
        for (const i of n.inputs) {
            if (seen.has(i.name)) errors.push(`「${n.name}」重复消费「${i.name}」`);
            seen.add(i.name);
        }
        for (const o of n.outputs)
            if (seen.has(o.name))
                errors.push(`「${n.name}」把「${o.name}」同时当输入和输出(自环)`);
    }
    if (errors.length > 0) return errors;

    /*
     * 建图(与 GDag.createLayer 同一推导规则)：producer → consumer。
     * 【不用 multi】：同一对节点间因多个 artifact 产生的"平行边"，
     * 用 mergeEdge 合并为一条，边属性 artifacts 累积名称列表——
     * 无环/可达性分析对平行边不敏感，simple graph 足够，
     * 且从根上消灭 multi 选项在建图/序列化/重构各处不一致的隐患
     * (graphology 对 options.multi 严格校验，不一致即抛异常)。
     */
    const g = new DirectedGraph();
    for (const n of nodes) g.addNode(n.name);
    for (const n of nodes) {
        for (const i of n.inputs) {
            const from = producer.get(i.name);
            if (!from || from === n.name) continue; // 无产出者=初始数据，合法入口
            if (g.hasEdge(from, n.name)) {
                const prev = g.getEdgeAttribute(from, n.name, 'artifacts') as string[];
                g.setEdgeAttribute(from, n.name, 'artifacts', [...prev, i.name]);
            } else {
                g.addEdge(from, n.name, { artifacts: [i.name] });
            }
        }
    }

    // 无环
    if (hasCycle(g)) {
        return [`加工关系存在循环。请调整节点的输入/输出打破循环`];
    }

    // 终端产物 = 交付物候选。0 个说明图是死的；多于 1 个说明有无贡献分支
    const consumed = new Set<string>();
    for (const n of nodes) for (const i of n.inputs) consumed.add(i.name);
    const terminals: string[] = [];
    for (const n of nodes)
        for (const o of n.outputs)
            if (!consumed.has(o.name)) terminals.push(o.name);

    if (terminals.length === 0)
        errors.push(`图中不存在终端产物：所有输出都被消费了，没有最终交付物`);
    if (terminals.length > 1)
        errors.push(`存在多个终端产物：${terminals.map(t => `「${t}」`).join("、")}。` +
            `只应有一个最终交付物，其余分支请并入主链或删除`);

    return errors;
}

// ─── 单循环流水线：起草→评审→抽取→图校验，失败统一回喂起草对话 ────────────

export async function designDag(task: DagTask, pctx: PlanContext): Promise<DagDesignResult> {
    const instructions = [
        task.roleInstruction, BASE_CONTEXT, BLUEPRINT_FORMAT, task.extraRules,
    ].filter(Boolean).join("\n\n");

    const messages: ModelMessage[] = [{ role: "user", content: task.request }];
    let lastFeedback = "";

    Logger.debug("[plan dag]: instructions=", instructions)
    for (let round = 1; round <= MAX_DESIGN_ROUNDS; round++) {

        Logger.debug("messages=", JSON.stringify(messages, null, 2))

        // 1) 起草(首轮)或按反馈修订(后续轮)
        const { text: blueprint } = await generateText({
            model: getSmartModel(),
            instructions,
            messages,
        });
        messages.push({ role: "assistant", content: blueprint });

        // 失败统一出口:反馈回喂起草对话，进入下一轮重出蓝图
        const refeed = (feedback: string): void => {
            lastFeedback = feedback;
            Logger.warn(`[plan-dag] 第 ${round} 轮未过：\n${feedback}`);
            messages.push({
                role: "user",
                content: `你的蓝图存在以下问题：\n${feedback}\n\n请修正后重新输出完整蓝图。保持无问题的部分不变，不要引入新问题。`,
            });
        };

        // 2) 宽松可行性评审(自然语言，只拦致命伤)
        const { text: review } = await generateText({
            model: getSmartModel(undefined, pctx.ctx),
            instructions: REVIEW_PROMPT,
            prompt: `设计任务：${task.request}\n\n待评审蓝图：\n${blueprint}`,
        });
        Logger.debug("[plan-dag] 可行性评审：", review);
        const issues = review.split("\n").filter(l => /^ISSUE:/i.test(l.trim()));
        if (issues.length > 0) {
            refeed(issues.join("\n"));
            continue;
        }
        // PASS 或格式异常——宽松评审的精神：解析不出问题就放行

        // 3) 抽取:蓝图原文直接进 safefmt。无抽取提示词——模型原生 JSON 输出
        //    优先，无则退化为 schema 提示词抽取，description 即抽取指令
        const fmt = await safefmt(blueprint, Output.object({ schema: NodeListSchema }), pctx.ctx);
        if (!fmt.success) {
            const errMsg = extractErrmsg(fmt.err);
            refeed(`蓝图无法提取出结构化的节点清单：\n${errMsg.join("\n")}\n` +
                `请检查【数据产物清单】与【加工节点清单】的表述是否完整清晰：` +
                `每个节点必须能明确对应到清单中的输入名称和输出名称。`);
            continue;
        }

        Logger.debug("[plan dag] fmt=", JSON.stringify(fmt.value?.output, null, 2))

        // 4) 代码图校验:连边推导 + 合规。错在设计不在抽取，同样回喂起草
        const nodes = fmt.value?.output.nodes;
        const errors = validateNodes(nodes);
        Logger.debug("fmt validation result:", errors.join("\n"))
        if (errors.length > 0) {
            refeed(errors.map((e, i) => `${i + 1}. ${e}`).join("\n"));
            continue;
        }

        return { text: blueprint, nodes };
    }

    throwUnprcessable(
        `DAG 设计失败：${MAX_DESIGN_ROUNDS} 轮后仍未通过。最后反馈：\n${lastFeedback}`);
}

// ─── 登记：归一进全局注册表 → 建层 → 挂到 GDag(内存操作，不落盘) ──────────

export async function registerLayer(
    result: DagDesignResult, pctx: PlanContext, asRoot: boolean,
): Promise<string> {
    const gdag = pctx.gdag;

    // 逐个产物过归一(Fuse + LLM)，节点 io 统一替换为正式名
    const pnodes: PNode[] = [];
    for (const n of result.nodes) {
        const norm = async (ios: typeof n.inputs) => {
            const out = [];
            for (const io of ios) {
                // Logger.debug("gdag.registerArtifact")
                const formal = await gdag.registerArtifact(io, pctx.ctx);
                // Logger.debug("gdag.registerArtifactformal=", formal)
                out.push({ ...io, name: formal });
            }
            return out;
        };
        pnodes.push({
            ...n,
            inputs: await norm(n.inputs),
            outputs: await norm(n.outputs),
            id: crypto.randomUUID(),
            status: 'pending',
            dag: null,
            error: null,
        });
    }

    return gdag.createLayer(pnodes, asRoot);
}
