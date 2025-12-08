import { llmCenter } from "../../index"
import promptTpl from './prompt.md';
import { callLlmWithValidation } from "../../utils/withvalidate";
import refineTpl from './concept_refine.md';
import procRefineTpl from './process_refine.md';

// console.log("promptTpl-", promptTpl)
// console.log("refineTpl",refineTpl)

import { z } from 'zod';
import { Eta } from 'eta';
import pMap from "p-map";

// 定义 Schema
export const FunctionSpecSchema = z.object({
  functionName: z
    .string()
    .min(2)
    .max(6)
    .describe("函数名称（简洁中文短语，2-6字，概括输入到输出的核心转换）"),

  inputName: z
    .string()
    .min(1)
    .describe("输入参数的概念名称（简洁，1-3个词或类型签名）"),
  inputDefinition: z
    .string()
    .min(1)
    .describe("输入参数的概念定义，包含显式输入和隐式输入"),
  inputExample: z
    .string()
    .min(1)
    .describe("输入参数的具体实例"),

  outputName: z
    .string()
    .min(1)
    .describe("期望输出的概念名称（简洁，1-3个词或类型签名）"),
  outputDefinition: z
    .string()
    .min(1)
    .describe("期望输出的概念定义，包含格式、结构、质量约束"),
  outputExample: z
    .string()
    .min(1)
    .describe("期望输出的具体实例，使用【示例开始】和【示例结束】包裹"),

  processName: z
    .string()
    .min(1)
    .describe("处理逻辑的概念名称"),
  processDefinition: z
    .string()
    .min(1)
    .describe("处理逻辑的概念定义，包含具体步骤"),
  processExample: z
    .string()
    .min(1)
    .describe("处理逻辑的具体实例"),

  notes: z
    .string()
    .describe("调用风险或待澄清项，无则为空字符串"),
});

const ConceptSchema = z.object({
  name: z.string().describe("概念名称（如需改名请在此体现）"),
  definition: z.string().describe("求精后的定义，包含边界说明：正例、反例、与相关概念的区分"),
  example: z.string().describe("最具代表性的典型示例"),
});

// 导出类型
export type FunctionSpec = z.infer<typeof FunctionSpecSchema>;


export async function applyLlm(input: string): Promise<FunctionSpec> {
  const eta = new Eta();
  const prompt = eta.renderString(promptTpl, {
    input
  })

  const result = await callLlmWithValidation({
    schema: FunctionSpecSchema,
    llmCall: async (p) => (await llmCenter.speedFirst()?.callJSON(p))?.json,
    basePrompt: prompt,
    maxRetries: 3
  })

  if (result) {

    // 开始求精．
    const inputs = {
      definition: result.inputDefinition,
      name: result.inputName,
      example: result.inputExample
    }
    const output = {
      definition: result.outputDefinition,
      name: result.outputName,
      example: result.outputExample
    }
    const process = {
      definition: result.processDefinition,
      name: result.processName,
      example: result.processExample
    }

    const inputPrompt = eta.renderString(refineTpl, {
      ...inputs,
      functionName: result.functionName,
      position: "input",
      output,
      process,
    })
    const outputPrompt = eta.renderString(refineTpl, {
      ...output,
      functionName: result.functionName,
      position: "output",
      inputs,
      process,
    })
    const processPrompt = eta.renderString(procRefineTpl, {
      ...process,
      functionName: result.functionName,
      position: "process",
      inputs,
      output,
    })

    const refineResults = await pMap([inputPrompt, outputPrompt, processPrompt], async (basePrompt) => {
      return await callLlmWithValidation({
        schema: ConceptSchema,
        llmCall: async (p) => (await llmCenter.speedFirst()?.callJSON(p))?.json,
        basePrompt,
        maxRetries: 3
      });
    })

    return {
      functionName: result.functionName,
      inputName: refineResults[0]?.name || "",
      inputDefinition: refineResults[0]?.definition || "",
      inputExample: refineResults[0]?.example || "",
      outputName: refineResults[1]?.name || "",
      outputDefinition: refineResults[1]?.definition || "",
      outputExample: refineResults[1]?.example || "",
      processName: refineResults[2]?.name ?? "",
      processDefinition: refineResults[2]?.definition ?? "",
      processExample: refineResults[2]?.example ?? "",
      notes: result.notes
    }
  }
  // const result = await llmCenter.fast.callJSON(prompt)
  console.log("result=", result);

  throw new Error("无法生成函数定义");
}