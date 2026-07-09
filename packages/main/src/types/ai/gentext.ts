import { GetSmartModelOptions } from "$libs/utils/model/index.js";
import { generateText, type ModelMessage } from "ai";

export type GenTextArgs = Parameters<typeof generateText>[0];
export type GenTextReturn = Awaited<ReturnType<typeof generateText>>;
export type GenTextPrompt = string | Array<ModelMessage>;


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export type LlmParamArgs = DistributiveOmit<GenTextArgs, 'model'> & {
    model?: GetSmartModelOptions; // 在这里定义你想要的新类型
};