import type { ModelOption } from "$types/shared/model.js";
import { throwUnprcessable } from "../utils/err.js";

export async function listModels(baseURL: string, apiKey: string): Promise<ModelOption[]> {

    // OpenAI 兼容的端点
    const response = await fetch(`${baseURL}/models`, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throwUnprcessable(`获取模型列表失败: ${response.statusText}`);
    }

    const data = await response.json();

    return data.data.map((model: Record<string, string>) => {
        return {
            id: model.id
        }
    });
}
