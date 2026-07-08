import { generateText, type ModelMessage } from "ai";

export type GenTextArgs = Parameters<typeof generateText>[0];
export type GenTextReturn = Awaited<ReturnType<typeof generateText>>;
export type GenTextPrompt = string | Array<ModelMessage>;