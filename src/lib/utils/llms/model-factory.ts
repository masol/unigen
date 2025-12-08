import { type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createXai } from '@ai-sdk/xai';
import type { LLMConfig } from "./index.type.js";
import type { ProviderInfo } from './providers.js';
import { PROVIDER_CONFIG } from "./providers.js";

/**
 * 模型工厂类 - 负责创建各种 LLM 模型实例
 */
export class ModelFactory {
    /**
     * 创建 AI SDK 模型实例
     */
    static createModel(config: LLMConfig): LanguageModel {
        const providerConfig = PROVIDER_CONFIG[config.provider];
        if (!providerConfig) {
            throw new Error(`不支持的提供商: ${config.provider}`);
        }

        const modelName = config.name.trim();
        const apiKey = config.apiKey;
        const baseURL = providerConfig.baseURL?.trim();
        const protocol = providerConfig.protocal || 'openai';

        try {
            return this.createModelByProtocol(protocol, modelName, apiKey, baseURL);
        } catch (error) {
            console.error(`创建模型失败 (${config.provider}):`, error);
            throw new Error(`无法创建模型: ${config.provider} - ${modelName}`);
        }
    }

    /**
     * 根据协议类型创建模型
     */
    private static createModelByProtocol(
        protocol: ProviderInfo['protocal'],
        modelName: string,
        apiKey: string,
        baseURL?: string
    ): LanguageModel {
        switch (protocol) {
            case 'openai':
                return this.createOpenAIModel(modelName, apiKey, baseURL, true);

            case 'anthropic':
                return this.createAnthropicModel(modelName, apiKey, baseURL);

            case 'xai':
                return this.createXaiModel(modelName, apiKey, baseURL);

            case 'google':
                return this.createGoogleModel(modelName, apiKey, baseURL);

            case 'huggingface':
                return this.createHuggingFaceModel(modelName, apiKey, baseURL);

            case 'perplexity':
                return this.createPerplexityModel(modelName, apiKey, baseURL);

            case 'ollama':
                return this.createOllamaModel(modelName, baseURL);

            default:
                // 默认使用 OpenAI 兼容协议（宽松模式）
                return this.createOpenAIModel(modelName, apiKey, baseURL, false);
        }
    }

    /**
     * 创建 OpenAI 模型
     * @param strict - true 为严格模式，false 为兼容模式
     */
    private static createOpenAIModel(
        modelName: string,
        apiKey: string,
        baseURL?: string,
        strict: boolean = true
    ): LanguageModel {
        void(strict);
        const openai = createOpenAI({
            apiKey,
            baseURL,
            // 移除 compatibility 属性，使用 fetch 选项来处理兼容性
            fetch: strict ? undefined : async (url, init) => {
                // 兼容模式：更宽松的错误处理
                try {
                    return await fetch(url, init);
                } catch (error) {
                    console.warn('OpenAI compatible fetch error:', error);
                    throw error;
                }
            }
        });
        return openai.chat(modelName);
    }

    /**
     * 创建 Anthropic 模型
     */
    private static createAnthropicModel(modelName: string, apiKey: string, baseURL?: string): LanguageModel {
        const anthropic = createAnthropic({
            apiKey,
            baseURL,
        });
        return anthropic.chat(modelName);
    }

    /**
     * 创建 xAI 模型
     */
    private static createXaiModel(modelName: string, apiKey: string, baseURL?: string): LanguageModel {
        const xai = createXai({
            apiKey,
            baseURL,
        });
        return xai(modelName);
    }

    /**
     * 创建 Google Generative AI 模型
     */
    private static createGoogleModel(modelName: string, apiKey: string, baseURL?: string): LanguageModel {
        const google = createGoogleGenerativeAI({
            apiKey,
            baseURL,
        });
        return google(modelName);
    }

    /**
     * 创建 HuggingFace 模型（使用 OpenAI 兼容接口）
     */
    private static createHuggingFaceModel(modelName: string, apiKey: string, baseURL?: string): LanguageModel {
        const huggingface = createOpenAI({
            apiKey,
            baseURL: baseURL || 'https://api-inference.huggingface.co/v1',
        });
        return huggingface(modelName);
    }

    /**
     * 创建 Perplexity 模型（使用 OpenAI 兼容接口）
     */
    private static createPerplexityModel(modelName: string, apiKey: string, baseURL?: string): LanguageModel {
        const perplexity = createOpenAI({
            apiKey,
            baseURL: baseURL || 'https://api.perplexity.ai',
        });
        return perplexity(modelName);
    }

    /**
     * 创建 Ollama 模型
     */
    private static createOllamaModel(modelName: string, baseURL?: string): LanguageModel {
        const ollama = createOpenAI({
            apiKey: 'ollama', // Ollama 不需要真实的 API key
            baseURL: baseURL || 'http://localhost:11434/v1',
        });
        return ollama(modelName);
    }
}