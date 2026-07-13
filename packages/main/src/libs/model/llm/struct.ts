import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { getCurrentProject } from "$libs/utils/api.js";
import { ProjectDbKeys } from "$libs/utils/db/dbkeys.js";
import { throwPrecondition } from "$libs/utils/err.js";
import type { GenTextArgs, GenTextReturn } from "$types/ai/gentext.js";
import { generateText, ModelMessage, NoObjectGeneratedError, Output, TypeValidationError } from "ai";
import { z } from "zod";
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
export async function exfmt<T extends z.ZodType>(nl: string, schema: T): Promise<z.infer<T> | null> {
    const result = await safeExfmt(nl, schema);
    if (result.success) {
        return result.value?.output
    }
    throw result.err
}

function getExtractPrompt() {
    const prj = getCurrentProject();
    if (prj) {
        const prjdb: PrjDB = PrjDB.ensure(prj);
        const str = prjdb.get<string>(ProjectDbKeys.extract_json_prompt)
        if (str) {
            // @todo: 使用hea
            return str;
        }
    }
}

export async function safeExfmtWithPrompt(nl: string, output: any): Promise<NlFormatType> {
    try {
        // const model = getSmartModel({ sort: SortStrategy.VersionAsc });
        // 模型负责从自然语言文本中提取符合 schema 的 JSON。
        const result = await generateText({
            // @todo:  预估token规模，并以minInctx: est(nl.length)作为筛选条件。
            model: getSmartModel({ sort: SortStrategy.VersionAsc }), // 弱模型优先。
            instructions: "",
            prompt: nl,
            temperature: 0,
            output,
        });
        return {
            success: true,
            value: result
        }
    } catch (e) {
        if (NoObjectGeneratedError.isInstance(e)) {
            // 无对象生成。通常是The feature "responseFormat" is not supported. 降级为使用提示词来提取JSON.
            return safeExfmtWithPrompt(nl, output);
        }
        return {
            success: false,
            err: e
        }
    }
}


// 从自然语言中，抽取JSON信息。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeExfmt(nl: string, output: any): Promise<NlFormatType> {
    try {
        // const model = getSmartModel({ sort: SortStrategy.VersionAsc });
        // 模型负责从自然语言文本中提取符合 schema 的 JSON。
        const result = await generateText({
            // @todo:  预估token规模，并以minInctx: est(nl.length)作为筛选条件。
            model: getSmartModel({ sort: SortStrategy.VersionAsc }), // 弱模型优先。
            prompt: nl,
            temperature: 0,
            output,
        });
        return {
            success: true,
            value: result
        }
    } catch (e) {
        if (NoObjectGeneratedError.isInstance(e)) {
            // 无对象生成。通常是The feature "responseFormat" is not supported. 降级为使用提示词来提取JSON.
            return safeExfmtWithPrompt(nl, output);
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

        const nlresult = await safeExfmt(newText, arg.output);
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