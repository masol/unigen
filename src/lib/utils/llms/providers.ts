// 移除langchain依赖．转而使用openAI兼容的API来通信，非支持OpenAI的服务，要制作adapter到OpenAI.
// 为了方便tool,mcp,skill支持，使用vercel/ai．

import type { LLMConfig } from "./index.type";
// import { createOpenAI } from '@ai-sdk/openai';


export type ProviderInfo = {
    baseURL: string;
    apikeyURL: string;
    // default protocal is openai
    protocal?: 'openai' | 'xai' | 'anthropic' | 'huggingface' | 'perplexity' | 'ollama' | 'google';
}

// 提供商配置映射,key作为i18n的key,自行定义到各自语言的名称．
export const PROVIDER_CONFIG: Record<string, ProviderInfo> = {
    qianwen: {
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apikeyURL: "https://dashscope.console.aliyun.com/apiKey"
    },
    deepseek: {
        baseURL: 'https://api.deepseek.com',
        apikeyURL: "https://platform.deepseek.com/api_keys"
    },
    qianfan: {
        baseURL: 'https://qianfan.baidubce.com/v2',
        apikeyURL: "https://console.bce.baidu.com/iam/#/iam/apikey/list"
    },
    zhipu: {
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        apikeyURL: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys"
    },
    hunyuan: {
        baseURL: "https://api.hunyuan.cloud.tencent.com/v1",
        apikeyURL: "https://console.cloud.tencent.com/hunyuan/api-key"
    },
    openrouter: {
        baseURL: 'https://openrouter.ai/api/v1',
        apikeyURL: "https://openrouter.ai/settings/keys"
    },
    // baichuan: {
    //     baseURL: 'https://api.baichuan-ai.com/v1',
    //     apikeyURL: 'https://platform.baichuan-ai.com/console/apikey'
    // },
    deepinfra: {
        baseURL: "https://api.deepinfra.com/v1/openai",
        apikeyURL: "https://deepinfra.com/dash/api_keys"
    },
    google: {
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apikeyURL: "https://aistudio.google.com/api-keys"
    },
    openai: {
        baseURL: 'https://api.openai.com/v1',
        apikeyURL: "https://platform.openai.com/api-keys"
    },
    groq: {
        baseURL: 'https://api.groq.com/openai/v1',
        apikeyURL: "https://console.groq.com/keys"
    },
    moonshot: {
        baseURL: 'https://api.moonshot.cn/v1',
        apikeyURL: "https://platform.moonshot.cn/console/api-keys"
    },
    poe: {
        baseURL: "https://api.poe.com/v1",
        apikeyURL: "https://poe.com/api_key"
    },
} as const;

export const ProviderNames = Object.keys(PROVIDER_CONFIG);

export async function listModels(config: LLMConfig): Promise<string[]> {
    const providerConfig = PROVIDER_CONFIG[config.provider];

    if (!providerConfig) {
        throw new Error(`不支持的提供商: ${config.provider}`);
    }

    const baseURL = (providerConfig.baseURL).trim();

    // OpenAI 兼容的端点
    const response = await fetch(`${baseURL}/models`, {
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        // return [];
        throw new Error(`获取模型列表失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data.map((model: Record<string, string>) => model.id);
}
