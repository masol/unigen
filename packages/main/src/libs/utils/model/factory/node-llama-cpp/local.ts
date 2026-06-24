import { LanguageModelV2 } from "@ai-sdk/provider";
import { llama } from "./provider.js";
import { configService } from "$libs/store/index.js";
import { generateText } from "ai";

let localModel: LanguageModelV2 | null = null;

export function getLocalModel() {
    if (localModel) {
        return localModel
    }
    const modelPath = configService().get("local_model");
    if (modelPath) {
        localModel = llama(modelPath);
    }
    return localModel;
}


export async function genText(prompt: string): Promise<string> {
    const model = getLocalModel();
    if (!model) {
        return "未加载本地LLM."
    }
    const { text } = await generateText({
        model,
        prompt,
    });
    return text;
}

