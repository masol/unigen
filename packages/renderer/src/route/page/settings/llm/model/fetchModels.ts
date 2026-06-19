// fetchModels.ts
import { api } from "$lib/utils/api";
import type { ModelOption } from "../types";
import memoize from 'memoize';


async function fetchImpl(baseURL: string, apiKey: string): Promise<ModelOption[]> {
    const result = await api().system.listmodel({ baseURL, apiKey })
    console.log("result=", result);
    return result as ModelOption[]
}

const memoizedFetch = memoize(fetchImpl, {
    cacheKey: arguments_ => arguments_.join(','),
    maxAge: 120000,
});

/**
 * 拉取「可选模型列表」。
 *
 * TODO: 在此调用真实接口（例如 GET {baseUrl}/models，携带 apiKey），
 * 将返回结果映射为 ModelOption[]（适配 Command 组件）。
 *
 * 约定：
 *  - 成功：resolve 一个 ModelOption 数组（可为空数组）
 *  - 失败：throw（编辑器会捕获并显示顶部警告，但仍允许手动编辑保存）
 */
export async function fetchAvailableModels(
    ctx: { baseUrl?: string; apiKey?: string },
): Promise<ModelOption[]> {
    if (!ctx.baseUrl || !ctx.apiKey) {
        throw new Error("试图获取模型，但是未给出baseUrl或者apiKey。");
    }
    return await memoizedFetch(ctx.baseUrl, ctx.apiKey);
}