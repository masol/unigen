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

## 数据模型（核心事实）
- 所有交付物只有两种形态：string 或 string[]。
- 入口：\`const ioinfo = glossary.getIO(cap); if (!ioinfo.expired) return;\`
- 读输入：\`ioinfo.inputs[i]\` 是第 i 个输入交付物的数据，形如 [{item, updatedAt?}, ...]，item 是实际内容（string）。
  - 可能有多个输入：inputs[0]、inputs[1]……对应 cap.input 各项。**不得只看 inputs[0]**。
- 校验：\`util.isString(x.item)\`，非法用 \`err.throwPrecondition(msg)\`。
- 存输出：\`glossary.save(cap.output[0], 值)\`。
  - **值是裸值**：输出为数组时是 string[]，为标量时是 string。**禁止包装成 {item}**。

## 数据处理拓扑（铁律：每个任务一次性拿到完整输入，负责处理全部数据；不存在外层帮你并行/分片/迭代）
- mechanical：纯代码，无 LLM。
- direct（标量→标量）：一次 llm.generate，save 标量。
- expand（标量→数组）：一次 llm.generate 产自然语言，再 \`llm.safefmt(text, llm.Output.object({ schema: z.array(z.string()) }))\` 提取为 string[]，成功取 ret.value.output，save 数组。
- map（数组→数组，等量）：**遍历输入数组每一条**逐条处理，每条产出**一条**，收集为 string[]，save 数组。
- flatmap（数组→数组，每条 fan-out）：**遍历输入数组每一条**，每条经 llm.generate + safefmt(z.array(z.string())) 产出**多条**，用 .flat() 扁平化汇总为一个大数组，save 数组。**提取失败要兜底为 [ret.text] 并 ctx.warn，不得丢数据**。
- reduce_concat（数组→标量）：逐条处理后用纯代码按序 join，save 标量。**聚合步无 LLM**。
- reduce_synthesize（数组→标量）：逐条处理后一次 llm.generate 跨条归纳，save 标量。

**提取 schema 固定为 z.array(z.string())，绝不自造对象数组。**
**map 与 flatmap 都必须遍历全部元素，绝不只处理 inputs[0][0]。**

## 并行 vs 串行
- sequential=false：数组处理用 util.pMap（并行）。
- sequential=true：**必须用 for 串行**，把前一条结果作为上下文传入下一条提示词。**禁止对 sequential 用 pMap**。

## 提示词加载
- 提示词从 kv 动态加载：\`glossary.get(cap.id + '_step<N>_system')\` / \`glossary.get(cap.id + '_step<N>_user')\`。
- **禁止把提示词内容硬编码进代码**。

## 通用准则
1. 文本交流用自然语言。llm.generate 取 .text。
2. 纯函数提到代码顶层，不要内联。
3. 不写 TS 类型注解。禁止 console.log 占位。
4. 用 err.throwXxx(msg) 而非 throw new Error。
5. 只输出一个 \`\`\`javascript 代码块，块外无任何字符。

## 本任务的处理流程（严格对齐）
数据流：{DATA_FLOW}
{FLOW_SUMMARY}

生成代码的 LLM 调用点数量、顺序，必须与流程和提供的提示词对数一致。`;

function buildExampleSection(): string {
    return CODEGEN_EXAMPLES.map((ex, i) =>
        `### 代码生成参考样本 ${i + 1}（dataFlow=${ex.dataFlow}）
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
        const shape = a?.isArray ? "数组 string[]" : "标量 string";
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
    return `- cap.output[0]（${n}）：${a?.intent ?? n}｜形态：${shape}${to}`;
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
            `处理阶段 ${i + 1}：system 键=${node.id}_step${i + 1}_system，user 键=${node.id}_step${i + 1}_user`
        ).join("\n");

    const parallelHint = plan.sequential
        ? "**sequential=true：数组处理必须用 for 串行，前一条结果传入下一条提示词。禁止 pMap。**"
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
        `### 数据流形态：${plan.dataFlow}`,
        plan.summary,
        parallelHint,
        ``,
        `### 输入（按 cap.input 顺序，可能多个，务必全部读取并遍历数组全部元素）`,
        describeInputs(node, pctx),
        ``,
        `### 输出（save 裸值）`,
        describeOutput(node, pctx),
        ``,
        `### 提示词加载点（代码用 glossary.get 读取，不要硬编码提示词内容）`,
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