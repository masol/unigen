import type { LLMConfig } from "./index.type";


export type ProviderInfo = {
    baseURL: string;
    defaultModel: string;
}

// 提供商配置映射,key作为i18n的key,自行定义到各自语言的名称．
export const PROVIDER_CONFIG: Record<string, ProviderInfo> = {
    qianwen: {
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        defaultModel: "qwen-flash"
    },
    deepseek: {
        baseURL: 'https://api.deepseek.com',
        defaultModel: 'deepseek-chat'
    },
    zhipu: {
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        defaultModel: 'glm-4'
    },
    openrouter: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultModel: 'qwen/qwen3-coder:free'
    },
    openai: {
        baseURL: 'https://api.openai.com/v1',
        defaultModel: 'gpt-3.5-turbo'
    },
    groq: {
        baseURL: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.1-8b-instant'
    },
    moonshot: {
        baseURL: 'https://api.moonshot.cn/v1',
        defaultModel: 'moonshot-v1-auto'
    },
    poe: {
        baseURL: "https://api.poe.com/v1",
        defaultModel: 'Claude-Opus-4.1'
    }
    // baichuan: {
    //     baseURL: 'https://api.baichuan-ai.com/v1',
    //     defaultModel: 'Baichuan2-Turbo'
    // },
} as const;

export const ProviderNames = Object.keys(PROVIDER_CONFIG);

export async function listModels(config: LLMConfig): Promise<string[]> {
    const providerConfig = PROVIDER_CONFIG[config.provider];
    const baseURL = (providerConfig.baseURL).trim();

    switch (config.provider) {
        case 'openai':
        case 'deepseek':
        case 'moonshot':
        case 'baichuan':
        case 'zhipu':
        case 'openrouter':
        case 'qianwen':
        case 'groq':
        case 'poe':
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
            return data.data.map((model: any) => model.id);

        // case 'Groq':
        //     // Groq API
        //     const groqResponse = await fetch('https://api.groq.com/openai/v1/models', {
        //         headers: {
        //             'Authorization': `Bearer ${config.apiKey}`,
        //             'Content-Type': 'application/json'
        //         }
        //     });

        //     const groqData = await groqResponse.json();
        //     return groqData.data.map((model: any) => model.id);

        default:
            throw new Error(`不支持的提供商: ${config.provider}`);
    }
}
