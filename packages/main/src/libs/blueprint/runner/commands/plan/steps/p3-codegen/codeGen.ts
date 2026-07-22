/**
 * 代码生成器：独立上下文，带代码生成参考样本。
 * 接收 (node, plan, promptPairs) → 生成可编译的 JS 代码。
 * code-generation 模型优先，失败在代码层回退通用文本模型。
 */

import { getSmartModel } from "$libs/model/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { type PNode } from "$types/index.js";
import { ModelTags } from '$types/shared/model.js';
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import { PlanContext, PromptPair } from "../../context.js";
import { CODEGEN_EXAMPLES } from "./codegen-examples.js";
import type { NodePlan } from "./plan.js";

const CODEGEN_INSTRUCTIONS = `你是数据处理代码生成器。

## 你的产物
一段 JavaScript（不是 TypeScript）代码片段，运行在以下沙箱中：

\`\`\`
(async function (__ioc__) {
  with (__ioc__) {
    /* 你生成的代码将出现在这里 */
  }
})
\`\`\`

即：你的代码处于 with 块内，可直接引用以下符号（不要重新声明或 require）：

- validator —— validator.js
- z —— zod
- delay(ms) —— 异步休眠
- util —— { randomUUID, pMap, ...radashi（isString/isArray/isObject/group/... 全部导出） }
- err —— { throwPrecondition, throwNotfound, throwNotimplement, throwUnprcessable, throwCancel }，均 (msg:string)=>never
- glossary —— { getIO(cap), save(key, value), set(key, value, opt?), get(key) }
- llm —— { generate({instructions, prompt, messages?})→Promise<{text}>, Output.object({schema}), safefmt(nl, output)→Promise<{success, value?}> }
- ctx —— { warn, error, debug, log }
- cap —— 当前处理任务对象（cap.id / cap.input / cap.output）

## 数据模型（核心事实，硬约束）
- 所有交付物只有两种形态：string（单一）或 string[]（多条）。形态在 save 那一刻定死，读出即同形态裸值。
- KV 以 JSON 持久化并自动还原：**读出即裸值**（字符串就是字符串，数组就是数组）。
- **严禁 JSON.parse / JSON.stringify。严禁 .item / .updatedAt 等字段访问或双层解包。** 输入项直接就是字符串，不是 { item } 对象。

## 数据存取规范（最高优先级，与 dataFlow 不同，必须严格遵守）

### 读输入
\`\`\`
const ioinfo = glossary.getIO(cap);
if (!ioinfo.expired) return;
const a = ioinfo.inputs[0];   // cap.input[0] 的裸值：string 或 string[]
const b = ioinfo.inputs[1];   // 多输入按序读，不得只读 inputs[0]
\`\`\`
- inputs[i] 已是裸值；数组元素直接就是字符串（**不要写 x.item**）。
- 判断是否数组用 **Array.isArray(x)**；判断字符串用 util.isString(x)。
- expired === false 直接 return。

### 写输出
\`\`\`
glossary.save(cap.output[0], value); // value 为裸 string 或 string[]
\`\`\`
- **禁止 {item} 包装。** 输出数组时是 string[]，标量时是 string。

### 读提示词（键名必须带前导下划线 '_'）
\`\`\`
const sys1 = glossary.get('_' + cap.id + '_step1_system');
const usr1 = glossary.get('_' + cap.id + '_step1_user');
\`\`\`
- **键名格式固定为 '_' + cap.id + '_step<N>_system' / '..._user'，前导下划线不可省略。**
- **禁止把提示词内容硬编码进代码。**

### 产出多条时的切分
- 一次 llm.generate 产出多条时，提示词已约定逐条分隔格式（每条独立成段、空行分隔）。
- 代码用**纯字符串切分**得到 string[]，例如：
  \`const parts = text.split(/\\n{2,}/).map(s => s.trim()).filter(Boolean);\`
  切分后直接 save，或在 flatmap 里 .flat() 汇总。

### safefmt（可选：从自然语言中提取程序所需的结构信息）
- \`llm.safefmt(nl, llm.Output.object({ schema }))\` 相当于"nl 版的 JSON.parse"，从一段自然语言中提取程序可用的结构信息。
- 靠 zod schema 的 .describe() 引导提取维度。成功时取 \`ret.value?.output\`。
- 适用于确需把文本转成程序可判定结构（分类结果、评分、布尔判定等）时。**是否使用由你综合判断，不强制、不禁止。**

## 关于 dataFlow（重要：这是参考建议，不是唯一正确骨架）
- 下方会给出一个 dataFlow 标签（mechanical / direct / expand / map / flatmap / reduce_concat / reduce_synthesize），它由上游 LLM 推断得出、**未经校验，仅供参考**。
- 你必须**综合全部信息**（节点意图、输入/输出的实际形态、上下游语境、全局目标）自行判断真实的处理拓扑。dataFlow 只作为一个先验线索。
- **若你的综合判断与 dataFlow 冲突，以你的综合判断为准。**
- 编译失败重试时同理：以代码正确性的综合判断为准，不把 dataFlow 当硬约束回灌。

## 各形态的典型处理范式（参考素材，非强制骨架；请结合实际选择或调整）
- mechanical：纯代码，无 llm，遍历全部输入元素处理。
- direct（string→string）：一次 generate，save 字符串。
- expand（string→string[]）：一次 generate 产多条 → 纯字符串切分 → save 数组。
- map（string[]→string[] 等量）：遍历全部元素，逐条 generate 返回一条，收集为数组。
- flatmap（string[]→每条多条）：遍历全部元素，每条 generate 产多条 → 切分 → .flat() 汇总。
- reduce_concat（string[]→string）：逐条处理后纯代码 join，**聚合步无 llm**。
- reduce_synthesize（string[]→string）：逐条处理后一次 generate 跨条归纳。

## 通用硬约束（不随 dataFlow 判断变化，始终成立）
- 数组输入必须遍历**全部**元素，不只取 [0]。
- sequential=true：用 for 串行，把前一条结果拼入下一条 prompt。**禁止 pMap**。
- sequential=false：数组处理用 util.pMap。
- 校验非法输入用 err.throwPrecondition(msg)，而非 throw new Error。
- 入口惯例：\`const ioinfo = glossary.getIO(cap); if (!ioinfo.expired) return;\`。
- 纯函数提到代码顶层，不要内联。不写 TS 类型注解。禁止 console.log 占位。
- 文本交流用自然语言。llm.generate 取 .text。
- 只输出一个 \`\`\`javascript 代码块，块外无任何字符。

## 本任务的参考信息
dataFlow 参考标签：{DATA_FLOW}
处理流程摘要（参考）：{FLOW_SUMMARY}

生成代码的 LLM 调用点数量、顺序，应与提供的提示词对数一致；但真实拓扑以你的综合判断为准。`;

function buildExampleSection(): string {
    return CODEGEN_EXAMPLES.map((ex, i) =>
        `### 代码生成参考样本 ${i + 1}（形态参考=${ex.dataFlow}）
意图：${ex.intent}
输入：${ex.inputs.join(", ")} / 输出：${ex.outputs.join(", ")}
LLM 调用点：${ex.llmStepCount}

代码：
\`\`\`javascript
${ex.code}
\`\`\``
    ).join("\n\n");
}

function extractCodeBlock(text: string): string | null {
    const m = text.match(/```(?:javascript|js)\s*\n([\s\S]*?)\n```/);
    return m ? m[1] : null;
}

async function callModel(
    instructions: string, prompt: string, ctx: IRunnerContext,
): Promise<string> {
    // 优先 code 优化模型；失败回退通用文本模型（回退是业务决策，放代码层）
    try {
        const { text } = await generateText({
            model: getSmartModel({ requiredAbilities: [ModelTags.Code] }, ctx),
            instructions,
            prompt,
        });
        return text;
    } catch (e) {
        Logger.warn(`[codeGen] code 模型不可用，回退通用文本模型：${(e as Error).message}`);
        const { text } = await generateText({
            model: getSmartModel(undefined, ctx),
            instructions,
            prompt,
        });
        return text;
    }
}

function describeInputs(node: PNode, pctx: PlanContext): string {
    return node.inputs.map((n, i) => {
        const a = pctx.gdag.getArtifact(n);
        const shape = a?.isArray ? "数组 string[]（元素直接是字符串）" : "标量 string";
        const producers = pctx.gdag.getProducersOf(n)
            .filter(p => p.nodeId !== node.id)
            .map(p => p.name);
        const from = producers.length ? `｜来自上游：${producers.join("、")}` : "";
        return `- inputs[${i}]（${n}）：${a?.intent ?? n}｜形态：${shape}${from}`;
    }).join("\n");
}

function describeOutput(node: PNode, pctx: PlanContext): string {
    const n = node.outputs[0];
    const a = pctx.gdag.getArtifact(n);
    const shape = a?.isArray ? "数组 string[]" : "标量 string";
    const consumers = pctx.gdag.getConsumersOf(n)
        .filter(c => c.nodeId !== node.id)
        .map(c => `${c.name}（${c.intent}）`);
    const to = consumers.length ? `\n  下游用途（决定输出粒度）：${consumers.join("；")}` : "";
    return `- cap.output[0]（${n}）：${a?.intent ?? n}｜形态：${shape}（save 裸值，禁止 {item} 包装）${to}`;
}

export async function genCodeForNode(
    node: PNode, plan: NodePlan, promptPairs: PromptPair[],
    pctx: PlanContext, priorError?: string | null,
): Promise<string> {
    const ctx = pctx.ctx;

    const instructions = [
        CODEGEN_INSTRUCTIONS
            .replace("{DATA_FLOW}", plan.dataFlow)
            .replace("{FLOW_SUMMARY}", plan.summary),
        "",
        "## 代码生成参考样本",
        buildExampleSection(),
    ].join("\n");

    const promptDesc = promptPairs.length === 0
        ? "（本任务为纯机械操作或逐条纯机械，无 LLM 调用，无提示词）"
        : promptPairs.map((p, i) =>
            `处理阶段 ${i + 1}：system 键=_${node.id}_step${i + 1}_system，user 键=_${node.id}_step${i + 1}_user（读取时用 '_' + cap.id + '_step${i + 1}_system'，前导下划线不可省）`
        ).join("\n");

    const parallelHint = plan.sequential
        ? "**sequential=true：数组处理必须用 for 串行，前一条结果拼入下一条提示词。禁止 pMap。**"
        : "sequential=false：数组处理用 util.pMap 并行。";

    const userMsg = [
        `### 全局目标（本工作最终服务于此）`,
        plan.globalGoal || "（未提供）",
        ``,
        `### 任务`,
        `名称：${node.name}`,
        `意图：${node.intent}`,
        `任务 id：${node.id}`,
        ``,
        `### 形态参考标签：${plan.dataFlow}（仅参考，以你对下方输入/输出实际形态的综合判断为准）`,
        plan.summary,
        parallelHint,
        ``,
        `### 输入（按 cap.input 顺序，可能多个；inputs[i] 是裸值，数组元素直接是字符串，务必全部读取并遍历数组全部元素）`,
        describeInputs(node, pctx),
        ``,
        `### 输出（save 裸值，禁止 {item} 包装）`,
        describeOutput(node, pctx),
        ``,
        `### 提示词加载点（代码用 glossary.get 读取，键名带前导 '_'，不要硬编码提示词内容）`,
        promptDesc,
        ``,
        priorError ? `### 上一轮编译失败，请修正：\n${priorError}\n` : "",
        `请生成该任务的代码。`,
    ].filter(Boolean).join("\n");

    const text = await callModel(instructions, userMsg, ctx);
    const code = extractCodeBlock(text);
    if (!code) {
        throw new Error(`[codeGen]「${node.name}」LLM 未返回 javascript 代码块`);
    }
    Logger.debug(`[codeGen]「${node.name}」生成代码 ${code.length} chars`);
    return code;
}