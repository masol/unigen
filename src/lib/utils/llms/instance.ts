import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { decode } from 'html-entities';
import JSON5 from 'json5';
import { marked, type Tokens } from "marked";
import type { LLMConfig, CallResult, JSONCallResult } from "./index.type.js";
import { isEmpty } from "remeda";
import { PROVIDER_CONFIG } from "./providers.js";

export class LLMWrapper {
    private client: OpenAI;

    constructor(
        private config: LLMConfig,
    ) {
        this.client = this.createClient();
    }

    /**
     * 创建 OpenAI 客户端实例
     */
    private createClient(): OpenAI {
        const providerConfig = PROVIDER_CONFIG[this.config.provider];
        if (!providerConfig) {
            throw new Error(`不支持的提供商: ${this.config.provider}`);
        }

        const baseURL = (providerConfig.baseURL).trim();

        const param = {
            apiKey: this.config.apiKey,
            baseURL,
            dangerouslyAllowBrowser: true, // 在浏览器环境中使用
        }

        if (providerConfig.create) {
            return providerConfig.create(param);
        }

        return new OpenAI(param);
    }

    /**
     * 获取模型名称
     */
    private getModel(): string {
        const providerConfig = PROVIDER_CONFIG[this.config.provider];
        return this.config.name.trim();
    }

    /**
     * 将输入转换为消息格式
     */
    private prepareInput(input: string | number | ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
        if (Array.isArray(input)) {
            return input;
        }

        const content = typeof input === 'number' ? input.toString() : input;
        return [{ role: 'user', content }];
    }

    /**
     * 提取响应内容
     */
    private extractResponse(message: OpenAI.Chat.Completions.ChatCompletionMessage): string {
        return message.content || '';
    }

    /**
     * 解析 JSON
     */
    private parseJSON(jsonString: string): any {
        const parsingAttempts = [
            () => JSON5.parse(jsonString),
            () => JSON5.parse(decode(jsonString))
        ];

        for (const attempt of parsingAttempts) {
            try {
                const result = attempt();
                if (!isEmpty(result)) {
                    return result;
                }
            } catch {
                continue;
            }
        }
        return null;
    }

    /**
     * 从 Markdown 中提取 JSON 代码块
     */
    private extractJsonBlock(markdown: string): any {
        const tokens = marked.lexer(markdown);

        const jsonBlocks = tokens
            .filter((t): t is Tokens.Code => t.type === "code")
            .filter(t => !t.lang || t.lang.toLowerCase() === "json")
            .map(t => {
                try {
                    return this.parseJSON(t.text.trim());
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        if (jsonBlocks.length > 0) {
            return jsonBlocks[0];
        }
        return null;
    }

    /**
     * 解析 JSON 字符串
     */
    private async extractJSON(jsonString: string): Promise<any> {
        const parsingAttempts = [
            () => this.parseJSON(jsonString),
            () => this.extractJsonBlock(jsonString),
        ];

        for (const attempt of parsingAttempts) {
            try {
                const result = attempt();
                if (result && !isEmpty(result)) {
                    return result;
                }
            } catch {
                continue;
            }
        }

        return null;
    }

    /**
     * 调用 LLM
     */
    async call(input: string | number | ChatCompletionMessageParam[]): Promise<CallResult> {
        const startTime = Date.now();

        try {
            const messages = this.prepareInput(input);

            const completion = await this.client.chat.completions.create({
                model: this.getModel(),
                messages,
                temperature: this.config?.temperature,
                max_tokens: this.config?.maxTokens,
            });

            const message = completion.choices[0]?.message;
            if (!message) {
                throw new Error('No response from LLM');
            }

            const response = this.extractResponse(message);
            const responseTime = Date.now() - startTime;

            return {
                success: true,
                response,
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
     * 调用 LLM 并返回 JSON
     */
    async callJSON(
        input: string | number | ChatCompletionMessageParam[],
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
        let jsonResult = await this.extractJSON(response);

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
                const fixPrompt = this.createJSONFixPrompt(response);
                console.log("fixJSONPrompt=", fixPrompt);
                const fixResult = await this.call(fixPrompt);

                // 如果修复调用失败，继续下一次尝试
                if (!fixResult.success) {
                    continue;
                }

                response = fixResult.response!;
                jsonResult = await this.extractJSON(response);

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
     * 创建 JSON 修复提示词
     */
    private createJSONFixPrompt(invalidResponse: string): string {
        return `
以下内容应该是JSON格式，但因为语法错误，解析失败了：

${invalidResponse}

请修复并返回正确的JSON格式。只返回修复后的JSON，不要添加任何解释或其他内容。
        `.trim();
    }

    /**
     * 流式调用 LLM
     */
    async callStream(
        input: string | number | ChatCompletionMessageParam[],
        onChunk: (chunk: string) => void
    ): Promise<CallResult> {
        const startTime = Date.now();

        try {
            const messages = this.prepareInput(input);
            let fullResponse = '';

            const stream = await this.client.chat.completions.create({
                model: this.getModel(),
                messages,
                temperature: this.config?.temperature,
                max_tokens: this.config?.maxTokens,
                stream: true,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    fullResponse += content;
                    onChunk(content);
                }
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