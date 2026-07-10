import { throwPrecondition } from '$libs/utils/err.js';
import type { Provider } from '$types/index.js';
import { ProviderProtocol } from '$types/shared/model.js';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderV4 } from '@ai-sdk/provider';
import { createXai } from '@ai-sdk/xai';
import Logger from 'electron-log/main.js';


/**
   * 创建 OpenAI 模型
   * @param strict - true 为严格模式，false 为兼容模式
   */
function createOpenAIModel(
    apiKey: string,
    baseURL?: string
): ProviderV4 {
    return createOpenAI({
        apiKey,
        baseURL,
        // // 移除 compatibility 属性，使用 fetch 选项来处理兼容性
        // fetch: strict
        //     ? undefined
        //     : async (url, init) => {
        //         // 兼容模式：更宽松的错误处理
        //         try {
        //             return await fetch(url, init);
        //         } catch (error) {
        //             Logger.warn('OpenAI compatible fetch error:', error);
        //             throw error;
        //         }
        //     }
    });
}

/**
 * 创建 Anthropic 模型
 */
function createAnthropicModel(
    apiKey: string,
    baseURL?: string
): ProviderV4 {
    return createAnthropic({
        apiKey,
        baseURL
    });
}

/**
 * 创建 xAI 模型
 */
function createXaiModel(
    apiKey: string,
    baseURL?: string
): ProviderV4 {
    return createXai({
        apiKey,
        baseURL
    });
}

/**
 * 创建 Google Generative AI 模型
 */
function createGoogleModel(
    apiKey: string,
    baseURL?: string
): ProviderV4 {
    return createGoogleGenerativeAI({
        apiKey,
        baseURL
    });
}

/**
 * 创建 HuggingFace 模型（使用 OpenAI 兼容接口）
 */
function createHuggingFaceModel(
    apiKey: string,
    baseURL?: string
): ProviderV4 {
    return createOpenAI({
        apiKey,
        baseURL: baseURL || 'https://api-inference.huggingface.co/v1'
    });
}


/**
 * 创建 Ollama 模型
 */
function createOllamaModel(baseURL?: string): ProviderV4 {
    return createOpenAI({
        apiKey: 'ollama', // Ollama 不需要真实的 API key
        baseURL: baseURL || 'http://localhost:11434/v1'
    });
}

/**
    * 根据协议类型创建模型
    */
function createProviderByProtocol(
    providerId: string,
    protocol: ProviderProtocol,
    apiKey: string,
    baseURL?: string
): ProviderV4 {
    switch (protocol) {
        case 'openai':
            return createOpenAIModel(apiKey, baseURL);

        case 'anthropic':
            return createAnthropicModel(apiKey, baseURL);

        case 'xai':
            return createXaiModel(apiKey, baseURL);

        case 'google-vertex':
            return createGoogleModel(apiKey, baseURL);

        case 'huggingface':
            return createHuggingFaceModel(apiKey, baseURL);

        case 'ollama':
            return createOllamaModel(baseURL);
        case 'deepseek':
            return createDeepSeek({
                apiKey,
                baseURL
            })
        case 'openai-compatible':
        default:
            if (!baseURL) {
                throwPrecondition("openai兼容协议必须提供URL地址。")
            }
            // 默认使用 OpenAI 兼容协议（宽松模式）
            return createOpenAICompatible({
                name: providerId,
                baseURL,
                apiKey
            });
    }
}

//provider: $llama-cpp： node-llama-cpp: 以$开头的Provider为内建Provider.
export function createProvider(provider: Provider): ProviderV4 {
    const apiKey = provider.apiKey ?? "";
    const baseURL = provider.baseUrl.trim();
    const protocol = provider.protocol || ProviderProtocol.OpenAI;

    try {
        return createProviderByProtocol(provider.id, protocol, apiKey, baseURL);
    } catch (error) {
        Logger.error(`创建ProviderV3失败 (${provider.id}:`, error);
        throw error;
    }
}
