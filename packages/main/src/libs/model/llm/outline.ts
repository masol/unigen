import { isNotfoundError, throwPrecondition } from "$libs/utils/err.js";
import type { GenTextArgs, GenTextReturn } from "$types/ai/gentext.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { ModelTags } from "$types/shared/model.js";
import {
    APICallError,
    extractJsonMiddleware,
    generateText,
    JSONParseError,
    ModelMessage,
    NoObjectGeneratedError,
    Output,
    TypeValidationError,
    wrapLanguageModel
} from "ai";
import Logger from "electron-log/main.js";
import { getErrorMessage, isPlainObject } from "radashi";
import { SortStrategy } from "../balancer/candidate.js";
import { getSmartModel } from "../balancer/get-smart-model.js";


export const MAX_EXTRACT_ATTEMPTS = 3;

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

/**
 * 判断错误是否为可通过"让模型重新输出"修复的格式/校验类错误。
 * 这是唯一的可重试判定入口，所有重试逻辑都以此为准，
 * 避免出现 "errMsgs 提取失败 → 被误判为不可重试" 的漏网情况。
 */
export function isRetryableExtractionError(e: unknown): boolean {
    return (
        NoObjectGeneratedError.isInstance(e) ||
        TypeValidationError.isInstance(e) ||
        JSONParseError.isInstance(e)
    );
}

/**
 * 从单个校验 issue 中尽力提取"合法候选值清单"。
 * 兼容 zod v4（issue.values）与 zod v3（issue.options），以及 keys/expected 等常见承载字段。
 * 这是与具体业务 schema 无关的通用能力：任何 enum / literal 联合类型的校验失败，
 * 都能借此把"应该取哪些值"明确回灌给模型，显著提升重试成功率。
 */
function extractAllowedValues(issue: Record<string, unknown>): string[] {
    const pick = (v: unknown): string[] | null => {
        if (Array.isArray(v) && v.length > 0) {
            return v.map((x) =>
                isPlainObject(x) ? JSON.stringify(x) : String(x));
        }
        return null;
    };
    // 按常见字段名依次尝试；不同 schema 库/版本承载合法值的键不同。
    return (
        pick(issue.values) ??   // zod v4 invalid_value
        pick(issue.keys) ??     // unrecognized_keys 等
        []
    );
}

/**
 * 尽力从错误中提取结构化的校验失败详情（字段路径 + 原因 + 合法候选值）。
 * 注意：本函数只负责"提取详情"，不承担"判定是否可重试"的职责。
 * 提取不到详情时返回空数组，由调用方兜底使用 getErrorMessage。
 */
export function extractErrmsg(error: unknown): string[] {
    const errMsg: string[] = [];

    // 兼容 zod v3/v4 与 standard-schema 的 issue 结构，
    // path 元素可能是 string/number，也可能是 { key: ... } 对象。
    const collectIssues = (zodError: unknown): void => {
        if (!isPlainObject(zodError)) return;
        const issues = (zodError as Record<string, unknown>).issues;
        if (!Array.isArray(issues)) return;

        for (const rawIssue of issues) {
            if (!isPlainObject(rawIssue)) continue;
            const issue = rawIssue as Record<string, unknown>;

            const rawPath = Array.isArray(issue.path) ? issue.path : [];
            const path = rawPath
                .map((seg: unknown) => {
                    if (isPlainObject(seg) && 'key' in seg) {
                        return String((seg as Record<string, unknown>).key);
                    }
                    return String(seg);
                })
                .join('.');

            const message =
                typeof issue.message === 'string' ? issue.message : JSON.stringify(issue);

            // 通用增强：若该 issue 携带"合法候选值集合"（enum/literal 联合类型等），
            // 显式、清晰地列出，避免其被埋没在转义后的 message 字符串里，
            // 让（可能较弱的）抽取模型能稳定地把非法值归一到某个合法值。
            const allowed = extractAllowedValues(issue);
            const allowedText = allowed.length > 0
                ? `，该字段只能取以下值之一（请从中选择语义最接近的一个，禁止使用其它值）: ${allowed.join(' | ')}`
                : '';

            const line = path
                ? `字段路径: ${path}, 原因: ${message}${allowedText}`
                : `原因: ${message}${allowedText}`;
            errMsg.push(line);
        }
    };

    // 定位真正承载校验信息的 TypeValidationError（可能是错误本身，也可能在 cause 链上）。
    let validationErr: TypeValidationError | undefined;
    if (TypeValidationError.isInstance(error)) {
        validationErr = error;
    } else if (NoObjectGeneratedError.isInstance(error) && TypeValidationError.isInstance(error.cause)) {
        validationErr = error.cause;
    }

    if (validationErr) {
        collectIssues(validationErr.cause);
        // issues 提取不到（空数组/非标准结构）时，退回错误自身消息。
        if (errMsg.length === 0) {
            errMsg.push(getErrorMessage(validationErr));
        }
    } else if (JSONParseError.isInstance(error) ||
        (NoObjectGeneratedError.isInstance(error) && JSONParseError.isInstance(error.cause))) {
        errMsg.push(`输出不是合法的 JSON: ${getErrorMessage(error)}`);
    }

    return errMsg;
}

/**
 * 构造格式校验失败后的重试反馈消息（ReAct 风格：观察错误 → 修正输出）。
 */
function buildExtractRetryPrompt(e: unknown): string {
    const details = extractErrmsg(e);
    // 兜底：无论如何都要有可读的错误反馈，保证重试消息有效。
    const feedback = details.length > 0 ? details.join('\n') : getErrorMessage(e);
    return `你输出的结果，无法通过格式校验，报错信息为：
\`\`\`text
${feedback}
\`\`\`
请根据上面的校验报错信息，改进之后，重新给出完整的、符合 Schema 的 JSON 输出。不要输出 JSON 之外的任何内容。`;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safefmtUsePrompt(nl: string, output: any, ctx?: IRunnerContext): Promise<NlFormatType> {
    const format = await output.responseFormat;
    if (!(isPlainObject(format) && 'type' in format && 'schema' in format && format.type == 'json')) {
        const msg = `[Outline] 在从约束输出降级为提示词约束时，因无法定位schema而无法降级:${format}`;
        Logger.warn(msg);
        return {
            success: false,
            err: new Error(msg)
        }
    }

    // 拿到要求，开始
    // 模型负责从自然语言文本中提取符合 schema 的 JSON。
    const instructions = `You are a deterministic JSON text extractor. Your single task is to translate user input into a valid JSON object that strictly adheres to the given JSON Schema.

[VALIDATION COMPLIANCE]
- You MUST generate all required fields specified in the schema.
- If the user input does not provide data for a required field, you MUST populate it with an appropriate schema-compliant default value (e.g., "", 0, [], false, or a logical fallback inferred from context).
- Strictly maintain the exact keys and data types (string, number, boolean, array, object) defined in the schema. Do not create unexpected fields.
- For enum / fixed-value fields, you MUST pick one of the exact allowed values defined in the schema. Never invent a value outside the allowed set; if the source text uses a synonym, map it to the closest allowed value.

[FORMATTING RULES]
- Output the raw JSON string matching the schema.
- Avoid any conversational dialogue, explanations, or text outside the JSON structure.

[TARGET JSON SCHEMA]
\`\`\`json
${JSON.stringify(format.schema, null, 2)}
\`\`\`

[CONVERSION EXECUTION]
Process the user input and generate the schema-compliant JSON now:`;


    const messages: ModelMessage[] = [
        { role: "user", content: nl },
    ];

    let lastErr: unknown;
    // 重试时逐步升温：首发确定性抽取，失败后升温以跳出复读式错误。
    // 步进 0.3，并对 MAX_EXTRACT_ATTEMPTS 做上限保护（封顶 0.9）。
    const tempFor = (attempt: number): number =>
        Math.min(0.9, (attempt - 1) * 0.3);
    for (let attempt = 1; attempt <= MAX_EXTRACT_ATTEMPTS; attempt++) {
        try {
            const result = await generateText({
                // @todo:  预估token规模，并以minInctx: est(nl.length)作为筛选条件。
                model: wrapLanguageModel({
                    model: getSmartModel({ sort: SortStrategy.VersionAsc }, ctx),
                    middleware: extractJsonMiddleware()
                }), // 弱模型优先。
                instructions,
                messages,
                temperature: tempFor(attempt),
                output: Output.text(),
            });

            messages.push({
                role: "assistant",
                content: result.text
            });

            const value = await output.parseCompleteOutput({
                text: result.text
            }, {
                response: result.finalStep.response,
                usage: result.usage,
                finishReason: result.finishReason
            });

            if (value !== undefined && value !== null) {
                return {
                    success: true,
                    value: {
                        ...result,
                        output: value
                    }
                }
            }

            // parseCompleteOutput 返回空值：不直接放弃，视为一次可重试的失败，
            // 反馈给模型后继续用完剩余重试次数。
            lastErr = new Error("parseCompleteOutput 返回空值，未能从输出中解析出 JSON 对象");
            messages.push({
                role: "user",
                content: `你输出的结果无法被解析为符合 Schema 的 JSON 对象。请重新输出完整的、严格符合 Schema 的 JSON，不要包含 JSON 之外的任何内容。`
            });
            continue;
        } catch (e) {
            lastErr = e;

            // 以错误类型判定是否可重试，
            // 确保所有格式/校验类错误都进入 ReAct 式重试，不再泄漏到外层。
            if (isRetryableExtractionError(e)) {
                const retryPrompt = buildExtractRetryPrompt(e);
                Logger.warn(
                    `[safefmtUsePrompt] 第 ${attempt}/${MAX_EXTRACT_ATTEMPTS} 次抽取失败（格式校验错误），准备重试:`,
                    getErrorMessage(e),
                    retryPrompt
                );
                messages.push({
                    role: "user",
                    content: retryPrompt
                });
                continue;
            }

            // 非格式类错误（如配置、鉴权等），重试无意义，直接失败返回。
            Logger.error("[safefmtUsePrompt] 试图从用户内容抽取信息时发生不可重试错误:", e);
            return {
                success: false,
                err: e
            }
        }
    }

    Logger.error(
        `[safefmtUsePrompt] 已重试 ${MAX_EXTRACT_ATTEMPTS} 次仍无法抽取合规 JSON:`,
        lastErr
    );
    return {
        success: false,
        err: lastErr
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
        // 降级到"提示词 + ReAct 重试"仅对以下情况有意义：
        //  1. NoObjectGeneratedError：含 schema 校验失败，换一条路径重新抽取可能成功；
        //  2. isNotfoundError：当前能力/模型缺失，尝试其它模型；
        //  3. 不可重试的 APICallError：通常是 responseFormat / 结构化输出不被该模型支持
        //     （4xx 参数类），退化为纯文本 + 提示词约束可绕开。
        // 而"可重试的 APICallError"（429 限流、5xx、鉴权/网络类）降级毫无意义，
        // 只会用弱模型再撞一次同样的墙、消耗配额并延迟真实错误暴露，故排除。
        const isDegradableApiError =
            APICallError.isInstance(e) && e.isRetryable === false;

        if (NoObjectGeneratedError.isInstance(e) || isNotfoundError(e) || isDegradableApiError) {
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

        lastError = nlresult.err ?? new Error("safefmt 返回失败但未携带错误对象");

        // 仅对可通过重试修复的格式类错误进行重新生成，其他错误直接抛出。
        if (!isRetryableExtractionError(nlresult.err)) {
            throw lastError;
        }

        // 将本次生成的文本与错误反馈加入会话，指导下一次生成（ReAct）。
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
 * 根据错误类型生成给上游模型的反馈提示。
 */
function buildRetryFeedback(e: unknown): string {
    const details = extractErrmsg(e);
    const detailText = details.length > 0 ? details.join('\n') : getErrorMessage(e);

    if (TypeValidationError.isInstance(e) ||
        (NoObjectGeneratedError.isInstance(e) && TypeValidationError.isInstance(e.cause))) {
        return `下游从你上次的内容中提取 JSON 时，Schema 校验失败：
\`\`\`text
${detailText}
\`\`\`
请结合上述错误信息，重新输出完整内容，确保其中包含校验所需的全部信息。`;
    }
    if (isRetryableExtractionError(e)) {
        return `下游从你上次的内容中提取 JSON 时失败：
\`\`\`text
${detailText}
\`\`\`
请结合上述错误信息，重新输出完整内容。`;
    }
    return `下游从内容中提取 JSON 时发生未知错误，请重新输出完整内容。`;
}