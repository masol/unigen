/**
 * 代码生成器：独立上下文，带参考样本。
 * 接收 (node, flowSpec, promptPairs) → 生成可编译的 JS 代码。
 * code-generation 模型优先，失败回退到通用文本模型（代码层做 fallback）。
 */

import { getSmartModel } from "$libs/model/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { type PNode } from "$types/index.js";
import { ModelTags } from '$types/shared/model.js';
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import { PromptPair } from "../../context.js";
import { CODEGEN_EXAMPLES } from "./codegen-examples.js";
import type { FlowSpec } from "./flow.js";

const CODEGEN_INSTRUCTIONS = `你是节点代码生成器。

## 你的产物
一段 JavaScript（不是 TypeScript）代码片段，运行在以下环境中：

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
- util —— { randomUUID, pMap, ...radashi（isString/isArray/group/... 全部导出） }
- err —— { throwPrecondition, throwNotfound, throwNotimplement, throwUnprcessable, throwCancel }，均 (msg:string)=>never
- glossary —— { getIO(cap), save(key, value), set(key, value, opt?), get(key) }
- llm —— { generate({instructions, prompt, messages?})→Promise<{text}>, Output.object({schema}), safefmt(nl, output)→Promise<{success, value?}> }
- ctx —— { warn, error, debug, log }
- cap —— 当前节点对象（cap.id / cap.input / cap.output）

## 行为准则
1. 入口：\`const ioinfo = glossary.getIO(cap); if (!ioinfo.expired) return;\`
2. 读输入：\`ioinfo.inputs[i]\`，是 [{item, updatedAt?}, ...] 数组。所有交付物只有 string 或 string[] 两种。
3. 存输出：\`glossary.save(cap.output[0], value)\`。
4. 提示词从 kv 动态加载，键格式：\`cap.id + '_step<N>_system'\` 与 \`cap.id + '_step<N>_user'\`。禁止把提示词硬编码进代码。
5. 数组语义：
   - map（array→array）：外层已并行，节点内只处理单条。
   - reduce（array→scalar）：用 util.pMap 逐条调 llm，再聚合。
   - scalar→array：调一次 llm 产出多条，如需结构化用 llm.safefmt(text, llm.Output.object({schema})) 提取。
6. 用 err.throwXxx(msg) 而非 throw new Error。
7. 纯函数提到顶层，不要内联。
8. 不写 TS 类型注解。禁止 console.log 占位。
9. 只输出一个 \`\`\`javascript 代码块，块外无任何字符。

## 本节点的处理流程（严格对齐）
{FLOW_SUMMARY}

生成的代码的 LLM 调用点数量、顺序，必须与流程和提供的提示词对数一致。`;

function buildExampleSection(): string {
    return CODEGEN_EXAMPLES.map((ex, i) =>
        `### 参考样本 ${i + 1}（流程=${ex.flowKind}）
意图：${ex.intent}
输入：${ex.inputs.join(", ")} / 输出：${ex.outputs.join(", ")}
提示词对数：${ex.promptPairs.length}

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
    // 优先 code 优化模型；失败回退通用文本模型
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

export async function genCodeForNode(
    node: PNode, flowSpec: FlowSpec, promptPairs: PromptPair[],
    ctx: IRunnerContext, priorError?: string | null,
): Promise<string> {
    const instructions = [
        CODEGEN_INSTRUCTIONS.replace("{FLOW_SUMMARY}", flowSpec.summary),
        "",
        "## 参考样本",
        buildExampleSection(),
    ].join("\n");

    const promptDesc = promptPairs.length === 0
        ? "（本节点为纯机械操作，无 LLM 调用，无提示词）"
        : promptPairs.map((p, i) =>
            `步骤${i + 1}：system 键=${node.id}_step${i + 1}_system，user 键=${node.id}_step${i + 1}_user`
        ).join("\n");

    const userMsg = [
        `### 节点`,
        `名称：${node.name}`,
        `意图：${node.intent}`,
        `kind：${node.kind}`,
        `节点 id：${node.id}`,
        ``,
        `### 流程形态：${flowSpec.kind}`,
        flowSpec.summary,
        ``,
        `### 提示词加载点（代码用 glossary.get 读取，不要硬编码提示词内容）`,
        promptDesc,
        ``,
        `### 输入输出`,
        `输入：${node.inputs.join(", ")}`,
        `输出：${node.outputs.join(", ")}`,
        priorError ? `\n### 上一轮编译失败，请修正：\n${priorError}` : "",
        ``,
        `请生成该节点的代码。`,
    ].filter(Boolean).join("\n");

    const text = await callModel(instructions, userMsg, ctx);
    const code = extractCodeBlock(text);
    if (!code) {
        throw new Error(`[codeGen]「${node.name}」LLM 未返回 javascript 代码块`);
    }
    Logger.debug(`[codeGen]「${node.name}」生成代码 ${code.length} chars`);
    return code;
}