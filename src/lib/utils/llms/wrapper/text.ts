import { generateText, generateObject, streamText, type LanguageModel, type ModelMessage } from 'ai';
import type { LLMConfig, CallResult, JSONCallResult, GenerateObjectResult, ILLMWrapper } from "../index.type.js";
import { z } from 'zod';
import { ModelFactory } from '../model-factory.js';
import { JSONParser } from '../json-parser.js';

export class TextWrapper implements ILLMWrapper {
    private model: LanguageModel;

    constructor(
        private config: LLMConfig,
    ) {
        this.model = ModelFactory.createModel(config);
    }

    /**
     * 将输入转换为消息格式
     */
    private prepareMessages(input: string | number | ModelMessage[]): ModelMessage[] {
        if (Array.isArray(input)) {
            return input;
        }

        const content = typeof input === 'number' ? input.toString() : input;
        return [{ role: 'user', content }];
    }

    /**
     * 调用 LLM
     */
    async call(input: string | number | ModelMessage[]): Promise<CallResult> {
        const startTime = Date.now();

        try {
            const messages = this.prepareMessages(input);

            const { text } = await generateText({
                model: this.model,
                messages,
                temperature: this.config?.temperature,
            });

            const responseTime = Date.now() - startTime;

            return {
                success: true,
                response: text,
                responseTime
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;
            const err = error as Error;

            console.error(`LLM调用失败 (${this.config.name}):`, error);

            return {
                success: false,
                error: err,
                responseTime
            };
        }
    }

    /**
     * 调用 LLM 并返回 JSON（基于文本解析，保留向后兼容）
     */
    async callJSON(
        input: string | number | ModelMessage[],
        maxRetries: number = 2
    ): Promise<JSONCallResult> {
        const startTime = Date.now();

        // 先正常调用 call 方法
        const callResult = await this.call(input);

        // 如果 call 调用失败，直接返回失败结果
        if (!callResult.success) {
            return {
                ...callResult,
                responseTime: Date.now() - startTime
            };
        }

        let response = callResult.response!;
        let jsonResult = await JSONParser.extractJSON(response);

        // 如果第一次解析成功，直接返回
        if (jsonResult !== null) {
            return {
                success: true,
                response,
                json: jsonResult,
                responseTime: Date.now() - startTime
            };
        }

        // JSON 解析失败，尝试修复
        let attempts = 0;
        while (attempts < maxRetries) {
            attempts++;

            try {
                const fixPrompt = JSONParser.createJSONFixPrompt(response);
                const fixResult = await this.call(fixPrompt);

                // 如果修复调用失败，继续下一次尝试
                if (!fixResult.success) {
                    continue;
                }

                response = fixResult.response!;
                jsonResult = await JSONParser.extractJSON(response);

                // 如果解析成功，返回结果
                if (jsonResult !== null) {
                    return {
                        success: true,
                        response,
                        json: jsonResult,
                        responseTime: Date.now() - startTime
                    };
                }
            } catch (error) {
                console.warn(`JSON修复第${attempts}次尝试失败:`, error);
            }
        }

        // 所有尝试都失败，返回解析失败的结果
        return {
            success: false,
            error: new Error('无法解析为有效JSON格式'),
            response,
            responseTime: Date.now() - startTime
        };
    }

    /**
     * 使用 schema 生成结构化对象（推荐使用）
     */
    async generateObject<T extends z.ZodType>(
        input: string | number | ModelMessage[],
        schema: T,
        options?: {
            mode?: 'auto' | 'json' | 'tool';
            schemaName?: string;
            schemaDescription?: string;
        }
    ): Promise<GenerateObjectResult<z.infer<T>>> {
        const startTime = Date.now();

        try {
            const messages = this.prepareMessages(input);

            const result = await generateObject({
                model: this.model,
                schema,
                mode: options?.mode || 'auto',
                schemaName: options?.schemaName,
                schemaDescription: options?.schemaDescription,
                messages,
                temperature: this.config?.temperature,
            });

            const responseTime = Date.now() - startTime;

            return {
                success: true,
                object: result.object as z.infer<T>,
                finishReason: result.finishReason,
                usage: result.usage,  // 直接传递
                responseTime
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;
            const err = error as Error;

            console.error(`生成对象失败 (${this.config.name}):`, error);

            return {
                success: false,
                error: err,
                responseTime
            };
        }
    }

    /**
     * 流式调用 LLM
     */
    async callStream(
        input: string | number | ModelMessage[],
        onChunk: (chunk: string) => void
    ): Promise<CallResult> {
        const startTime = Date.now();

        try {
            const messages = this.prepareMessages(input);

            const { textStream } = await streamText({
                model: this.model,
                messages,
                temperature: this.config?.temperature,
            });

            let fullResponse = '';

            for await (const chunk of textStream) {
                fullResponse += chunk;
                onChunk(chunk);
            }

            const responseTime = Date.now() - startTime;

            return {
                success: true,
                response: fullResponse,
                responseTime
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;
            const err = error as Error;

            console.error(`LLM流式调用失败 (${this.config.name}):`, error);

            return {
                success: false,
                error: err,
                responseTime
            };
        }
    }

    /**
     * 获取配置信息
     */
    getConfig(): LLMConfig {
        return { ...this.config };
    }
}