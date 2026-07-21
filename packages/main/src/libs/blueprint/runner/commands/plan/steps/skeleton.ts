/**
 * ============================================================================
 * 【P-skeleton · 人类流程先验检索】
 * ============================================================================
 */
import { getSmartModel } from "$libs/model/index.js";
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import { RAG_SKELETON_LIMIT } from "../config.js";
import { PlanContext } from "../context.js";
import { globalKnowledgeDB } from "../knowledge.js";

/**
 * 人类流程生成的 CoT 提示词
 *
 * 设计要点：
 * 1. 深度优先：明确要求"先列每一步的输入材料，再列动作，最后列产出"，
 *    强制 LLM 在每一步都思考"我看到了什么 → 我在想什么 → 我产出什么"，
 *    避免粗粒度的"先调研→再分析→再输出"式空话。
 * 2. 反合并：显式禁止"把多个原子操作打包成一步"，
 *    因为本流程生成的 procedure 默认面向强模型，粗粒度会在弱模型时回不去。
 * 3. 节点-产物对齐：每一步必须恰好产生一个中间交付物（与 DAG 设计阶段的"一节点一产出"约束一致）。
 * 4. 证据导向：禁止"调研/分析/优化"等空泛动词作为步骤名，
 *    必须是"读 X → 写 Y"这种具体动作。
 */
const GENERATOR_INSTRUCTIONS = `你是领域专家。给定一个数据处理/业务自动化目标，描述一位资深人类专家会如何**逐环节**处理它。

## 你的输出会被下游自动拆解为"每个环节一个节点、每个节点恰好一个产出"的 DAG 形式。
因此你的步骤必须满足：
- **每步恰好产出 1 个中间交付物**（不能一步产出多份）
- **每步有明确的输入材料**（不能凭空开始）
- **步与步之间通过交付物串联**（A 的产出是 B 的输入之一）

## 输出格式（自然语言分节，不要输出 JSON）

### 步骤清单

按顺序列出每一步。每步用以下结构：

**步骤 N：{动作名}**
- 输入材料：{看哪些已有材料/中间产物}
- 做什么：{具体动作，2-3 句话。必须说清楚"看了什么、想了什么、写了什么"}
- 产出：{新增了哪一份中间交付物}

【CoT 引导】在写每步之前，先在脑中回答：
1. "这一步**之前**，人类手头有哪些材料？"——只列已有材料，不要列待产出物。
2. "人类在这步**脑子里的注意力焦点**是什么？"——一个焦点。不要试图同时想两件事。
3. "这一步**之后**，人类手头多出了什么？"——必须能命名这份新产物。

【反合并铁律】
- 禁止把多个原子操作打包成一步（例如禁止"调研并分析"、"提取并分类并汇总"）
- 禁止使用"调研"、"分析"、"优化"、"处理"等空泛动词作为步骤名
- 步骤名必须是动宾结构且宾语具体（例如"读源文档"、"提取客户名单"、"生成摘要初稿"）

### 中间交付物清单

把步骤中提到的所有中间产物按出现顺序列出，每项一行：
- 名称：{产物名，脱离上下文可理解}
- 说明：{这份数据/文档是什么，产出后被谁消费}
- 规模：small(<1K tokens) / medium(1K-10K) / large(10K-600K) / unbounded(>600K 或条目数不定)

## 规则
- **深度优先，宁细勿粗**：宁可拆成 8 步也不要 3 步模糊概括。
  下游有降级机制（粒度太细会自动合并），但粒度太粗无法补救。
- 只讲人类在做什么、产出什么。不讲工具/技术/性能/界面/部署。
- 中间交付物名全文统一，同份数据一个名字。
- 禁止提问。目标模糊时采用该领域最通行解释推进。
- 步骤数量最小化（仅在"无法一步做完"时拆步），但拆出后每步必须独立可验证。`;

/**
 * 单轮生成人类流程
 *
 * 注意：本流程不做 reAct 评审循环——下游 designDag 有完整校验，
 * 这里生成的工作流是"原料"，质量由设计阶段兜底。
 * 但因为默认面向强模型，必须保证首次生成足够细，
 * 否则强模型后续降级也无法挽回。
 */
async function generateOnce(query: string, pctx: PlanContext): Promise<string> {
    const { text } = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions: GENERATOR_INSTRUCTIONS,
        prompt: query,
    });
    return text.trim();
}

export async function fetchProcedurePrior(query: string, pctx: PlanContext): Promise<string> {
    // 1) RAG 知识库
    const hits = await globalKnowledgeDB.searchProcedure(query, RAG_SKELETON_LIMIT);
    if (hits.length > 0) {
        const text = hits.map((h, i) =>
            `### 参考流程 ${i + 1}${h.source ? `(${h.source})` : ""}\n${h.procedure}`
        ).join("\n\n");
        Logger.debug(`[skeleton] RAG 命中人类流程先验 ${hits.length} 条`);
        return text;
    }

    // 2) LLM 生成（强模型默认细粒度，弱模型降级由 designDag 外层处理）
    Logger.debug(`[skeleton] RAG 未命中，LLM 生成流程（细粒度）`);
    const text = await generateOnce(query, pctx);

    Logger.info(`[skeleton] 流程生成完成 len=${text.length}`);
    return `### LLM 提炼的人类处理流程\n${text}`;
}