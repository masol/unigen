import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { type BaseLanguageModel } from "@langchain/core/language_models/base";
import { type BaseMessage } from "@langchain/core/messages";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { decode } from 'html-entities'
import JSON5 from 'json5'
import { marked, type Tokens } from "marked";
import type { LLMConfig, CallResult, JSONCallResult } from "./index.type.js";
import { isEmpty } from "remeda";
import { PROVIDER_CONFIG } from "./providers.js";

export class LLMWrapper {
    private llm: BaseLanguageModel;
    private jsonParser: JsonOutputParser;

    constructor(
        private config: LLMConfig,
        private options?: {
            model?: string;
            temperature?: number;
            maxTokens?: number;
            baseURL?: string;
        }
    ) {
        this.llm = this.createLLM();
        this.jsonParser = new JsonOutputParser();
    }

    /**
     * 创建LLM实例
     */
    private createLLM(): BaseLanguageModel {
        const providerConfig = PROVIDER_CONFIG[this.config.provider];
        if (!providerConfig) {
            throw new Error(`不支持的提供商: ${this.config.provider}`);
        }

        const baseURL = (this.options?.baseURL || providerConfig.baseURL).trim();
        const model = (this.config.name || this.options?.model || providerConfig.defaultModel).trim();

        const commonOptions: { model: string, [key: string]: any } = {
            model,
        };

        if (this.options?.temperature) {
            commonOptions.temperature = this.options?.temperature;
        }

        if (this.options?.maxTokens) {
            commonOptions.maxTokens = this.options?.maxTokens;
        }

        switch (this.config.provider) {
            case 'groq':
                // return new ChatGroq({
                //     ...commonOptions,
                //     apiKey: this.config.apiKey
                // });
            case 'deepseek':
            case 'openai':
            case 'moonshot':
            case 'baichuan':
            case 'zhipu':
            case 'openrouter':
            case 'qianwen':
            case 'poe':
                return new ChatOpenAI({
                    apiKey: this.config.apiKey,
                    openAIApiKey: this.config.apiKey,
                    ...commonOptions,
                    // @ts-expect-error 兼容groq等部分接口．
                    baseURL,
                    configuration: {
                        baseURL
                    }
                });

            default:
                throw new Error(`不支持的 LLM 提供商: ${this.config.provider}`);
        }
    }

    /**
     * 将输入转换为消息格式
     */
    private prepareInput(input: string | number | BaseMessage[]): BaseMessage[] {
        if (Array.isArray(input)) {
            return input;
        }

        const content = typeof input === 'number' ? input.toString() : input;
        return [new HumanMessage(content)];
    }

    /**
     * 提取响应内容
     */
    private extractResponse(result: any): string {
        if (typeof result === 'string') {
            return result;
        }

        if (result && typeof result === 'object' && 'content' in result) {
            return result.content;
        }

        return String(result);
    }

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
                // 忽略错误，继续尝试下一个解析方法
                continue;
            }
        }
        return null;
    }

    /**
     * 解析JSON字符串
     */
    private async extractJSON(jsonString: string): Promise<any> {
        const parsingAttempts = [
            () => this.jsonParser.parse(jsonString),
            () => this.parseJSON(this.extractJsonBlock(jsonString)),
            () => this.parseJSON(jsonString)
        ];

        for (const attempt of parsingAttempts) {
            try {
                const result = await attempt();
                if (result && !isEmpty(result)) {
                    return result;
                }
            } catch {
                // 忽略错误，继续尝试下一个解析方法
                continue;
            }
        }

        return null;
    }

    private extractJsonBlock(markdown: string): any[] | any {
        const tokens = marked.lexer(markdown);

        const jsonBlocks = tokens
            .filter((t): t is Tokens.Code => t.type === "code") // 类型守卫
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
            return jsonBlocks[0]
        }
        return markdown;
    }

    /**
     * 调用LLM
     */
    async call(input: string | number | BaseMessage[]): Promise<CallResult> {
        const startTime = Date.now();

        try {
            const messages = this.prepareInput(input);
            const result = await this.llm.invoke(messages);
            const response = this.extractResponse(result);
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

    async callJSON(
        input: string | number | BaseMessage[],
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
                console.log("fixJSONPrompt=", fixPrompt)
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
                // 修复过程中的错误，继续下一次尝试
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
     * 创建JSON修复提示词
     */
    private createJSONFixPrompt(invalidResponse: string): string {
        const formatInstructions = this.jsonParser.getFormatInstructions();

        const template = `
以下内容是JSON格式，但因为语法错误，解析失败了：

${JSON.stringify(invalidResponse)}

${JSON.stringify(formatInstructions)}

请修复并返回正确的JSON：
        `.trim();

        return template;
        // return render(template, { invalidResponse, formatInstructions });
    }

    /**
     * 流式调用LLM
     */
    async callStream(
        input: string | number | BaseMessage[],
        onChunk: (chunk: string) => void
    ): Promise<CallResult> {
        const startTime = Date.now();

        try {
            const messages = this.prepareInput(input);
            let fullResponse = '';

            const stream = await this.llm.stream(messages);

            for await (const chunk of stream) {
                const chunkContent = this.extractResponse(chunk);
                fullResponse += chunkContent;
                onChunk(chunkContent);
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

    /**
     * 获取当前选项
     */
    getOptions() {
        return { ...this.options };
    }
}


