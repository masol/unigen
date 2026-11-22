import type { ModelOption } from "$types/shared/model.js";
import Logger from "electron-log/main.js";
import { throwUnprocessable } from "../utils/err.js";


export async function listModels(baseURL: string, apiKey: string): Promise<ModelOption[]> {
    // Logger.debug(`enter listModels`, baseURL);

    // 1. 规范化 baseURL，移除末尾可能的斜杠，避免双斜杠404
    const normalizedBaseURL = baseURL.replace(/\/+$/, '');
    const url = `${normalizedBaseURL}/models`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json', // 明确告诉服务器期望JSON
    };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    let response: Response;
    try {
        // 2. 将 fetch 本身包裹在 try-catch 中，捕获网络层/CORS错误
        response = await fetch(url, { headers });
    } catch (error) {
        Logger.debug("fetch 请求失败（可能是网络或CORS问题）", error);
        throwUnprocessable(`网络请求失败: ${error instanceof Error ? error.message : String(error)}`);
        return []; // 仅为通过TypeScript检查，throw后不会执行
    }

    // 3. 先检查HTTP状态码
    if (!response.ok) {
        // 尝试读取响应文本，以便记录服务器返回的实际错误信息（可能是HTML）
        const errorText = await response.text().catch(() => '无法读取响应体');
        Logger.debug(`获取模型列表失败: ${response.status} ${response.statusText}`, errorText.substring(0, 500));
        throwUnprocessable(`获取模型列表失败 (HTTP ${response.status}): ${response.statusText}`);
    }

    // 4. 安全地解析JSON
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
        const text = await response.text();
        data = JSON.parse(text);
    } catch (error) {
        Logger.debug("响应体不是有效的JSON", error);
        throwUnprocessable(`响应数据格式错误，无法解析为JSON`);
    }

    // Logger.debug("listModels result:", data);

    // 5. 防御性检查 data.data 是否存在且为数组
    if (!data || !Array.isArray(data.data)) {
        Logger.debug("返回的JSON格式不符合预期（缺少data数组）", data);
        throwUnprocessable(`获取模型列表失败: 返回数据格式不符合预期`);
    }

    return data.data.map((model: Record<string, string>) => {
        return {
            id: model.id
        };
    });
}