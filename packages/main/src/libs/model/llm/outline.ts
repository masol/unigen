import { isNotfoundError, throwPrecondition } from "$libs/utils/err.js";
import type { GenTextArgs, GenTextReturn } from "$types/ai/gentext.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { ModelTags } from "$types/shared/model.js";
import { APICallError, extractJsonMiddleware, generateText, ModelMessage, NoObjectGeneratedError, Output, TypeValidationError, wrapLanguageModel } from "ai";
import Logger from "electron-log/main.js";
import { isPlainObject } from "radashi";
import { SortStrategy } from "../balancer/candidate.js";
import { getSmartModel } from "../balancer/get-smart-model.js";

/**
 * 如果 arg.output 为 object/array，并且使用了 zod，则拦截 output，
 * 并使用 "Natural Language to format" 的方式返回 JSON。
 * 文本输出质量更高，参考论文：
    https://arxiv.org/abs/2604.25359
    https://aclanthology.org/2026.eacl-long.256/ 
 * @param arg
 */

export interface NlFormatType {
    success: boolean;
    value?: GenTextReturn;
    err?: unknown;
}

// 从nl中抽取json object.失败抛出异常。
// export async function exfmt<T extends z.ZodType>(nl: string, schema: T): Promise<z.infer<T> | null> {
//     const result = await safeExfmt(nl, schema);
//     if (result.success) {
//         return result.value?.output
//     }
//     throw result.err
// }


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safefmtUsePrompt(nl: string, output: any, ctx?: IRunnerContext): Promise<NlFormatType> {
    try {
        const format = await output.responseFormat;
        if (isPlainObject(format) && 'type' in format && 'schema' in format && format.type == 'json') {
            // 拿到要求，开始
            // 模型负责从自然语言文本中提取符合 schema 的 JSON。
            const instructions = `You are a deterministic JSON text extractor. Your single task is to translate user input into a valid JSON object that strictly adheres to the given JSON Schema.

[VALIDATION COMPLIANCE]
- You MUST generate all required fields specified in the schema.
- If the user input does not provide data for a required field, you MUST populate it with an appropriate schema-compliant default value (e.g., "", 0, [], false, or a logical fallback inferred from context).
- Strictly maintain the exact keys and data types (string, number, boolean, array, object) defined in the schema. Do not create unexpected fields.

[FORMATTING RULES]
- Output the raw JSON string matching the schema.
- Avoid any conversational dialogue, explanations, or text outside the JSON structure.

[TARGET JSON SCHEMA]
\`\`\`json
${JSON.stringify(format.schema, null, 2)}
\`\`\`

[CONVERSION EXECUTION]
Process the user input and generate the schema-compliant JSON now:`;

            const result = await generateText({
                // @todo:  预估token规模，并以minInctx: est(nl.length)作为筛选条件。
                model: wrapLanguageModel({
                    model: getSmartModel({ sort: SortStrategy.VersionAsc }, ctx),
                    middleware: extractJsonMiddleware()
                }), // 弱模型优先。
                instructions,
                prompt: nl,
                temperature: 0,
                output: Output.text(),
            });

            const value = await output.parseCompleteOutput({
                text: result.text
            }, {
                response: result.finalStep.response,
                usage: result.usage,
                finishReason: result.finishReason
            })
            if (value) {
                return {
                    success: true,
                    value: {
                        ...result,
                        output: value
                    }
                }
            }
            return {
                success: false
            }
        } else {
            const msg = `[Outline] 在从约束输出降级为提示词约束时，因无法定位schema而无法降级:${format}`;
            Logger.warn(msg);
            return {
                success: false,
                err: new Error(msg)
            }
        }
    } catch (e) {
        return {
            success: false,
            err: e
        }
    }
}


/**
 * 从自然语言中，抽取JSON信息。
 * @param nl 
 * @param output vercel ai sdk的Ouput.object()的返回值。
 * @returns 
 */ // eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safefmt(nl: string, output: any, ctx?: IRunnerContext): Promise<NlFormatType> {
    try {
        // const model = getSmartModel({ sort: SortStrategy.VersionAsc });
        // 模型负责从自然语言文本中提取符合 schema 的 JSON。
        const result = await generateText({
            // @todo:  预估token规模，并以minInctx: est(nl.length)作为筛选条件。
            model: getSmartModel({ sort: SortStrategy.VersionAsc, requiredAbilities: [ModelTags.Outline] }, ctx), // 弱模型优先。
            prompt: nl,
            temperature: 0,
            output,
        });
        return {
            success: true,
            value: result
        }
    } catch (e) {
        if (NoObjectGeneratedError.isInstance(e) || isNotfoundError(e) || APICallError.isInstance(e)) {
            // 无对象生成。通常是The feature "responseFormat" is not supported. 降级为使用提示词来提取JSON.
            return safefmtUsePrompt(nl, output, ctx);
        }
        return {
            success: false,
            err: e
        }
    }
}

export async function NL2Format(arg: GenTextArgs): Promise<GenTextReturn> {
    if (!arg.output) {
        return await generateText(arg);
    }

    const session = buildInitialSession(arg);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { prompt, messages, output, ...restArgs } = arg;

    // 复用网络级的失败重试。vercel ai 没有验证错误重试的配置，而是直接抛异常。
    const maxRetries = arg.maxRetries ?? 3;

    let lastError: unknown;

    for (let curTries = 0; curTries < maxRetries; curTries++) {
        const genedText = await generateText({
            ...restArgs,
            prompt: session,
            output: Output.text(),
        });
        const newText = genedText.text;

        const nlresult = await safefmt(newText, arg.output);
        if (nlresult.success && nlresult.value) {
            return nlresult.value
        }

        // @todo: 验证失败，是否格式解析错误应该重试提取，而不是重新生成？
        lastError = nlresult.err;

        // 仅对可通过重试修复的错误进行重试，其他错误直接抛出。
        if (!isRetryableExtractionError(lastError)) {
            throw lastError;
        }

        // 将本次生成的文本与错误反馈加入会话，指导下一次生成。
        session.push({ role: "assistant", content: newText });
        session.push({
            role: "user",
            content: buildRetryFeedback(lastError),
        });
    }

    // 循环结束仍未成功，抛出最后一次错误，确保函数总有明确的退出路径。
    throw lastError;
}

/**
 * 根据入参构造初始会话消息列表。
 */
function buildInitialSession(arg: GenTextArgs): ModelMessage[] {
    const value = arg.prompt ?? arg.messages;
    if (!value) {
        throwPrecondition("未提供用户提示词");
    }

    if (Array.isArray(value)) {
        return [...value];
    }

    return [{ role: "user", content: value }];
}

/**
 * 判断错误是否为可通过重试修复的 JSON 提取错误。
 */
function isRetryableExtractionError(e: unknown): boolean {
    return TypeValidationError.isInstance(e) || NoObjectGeneratedError.isInstance(e);
}

/**
 * 根据错误类型生成给上游模型的反馈提示。
 */
function buildRetryFeedback(e: unknown): string {
    if (TypeValidationError.isInstance(e)) {
        return `请结合后面错误重新输出，下游从上次内容中提取 JSON 时，验证失败：${e.message}`;
    }
    if (NoObjectGeneratedError.isInstance(e)) {
        return `请结合后面错误重新输出，下游从上次内容中提取 JSON 时失败：${e.message}`;
    }
    return `下游从内容中提取 JSON 时发生未知错误`;
}