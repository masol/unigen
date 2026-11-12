// packages/main/src/libs/tooldb/tools/meta-tools/validate.ts
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import Logger from "electron-log/main.js";
import { loads } from "json-repair-js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ToolMeta } from "../../type.js";
import { getInputSchema } from "./schema.js";

export type ToolArgValidation =
    | { ok: true; value: unknown; validated: boolean }
    | { ok: false; issues: unknown; value: unknown };

export async function validateToolArgs(
    meta: ToolMeta,
    args: unknown,
): Promise<ToolArgValidation> {
    const schema = getInputSchema(meta);
    if (!schema) {
        return { ok: true, value: args, validated: false };
    }

    const result = await validateWithSchema(schema, args);
    if (!result) {
        return { ok: true, value: args, validated: false };
    }

    return result;
}

async function validateWithSchema(
    schema: unknown,
    args: unknown,
): Promise<ToolArgValidation | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySchema = schema as any;

    try {
        if (typeof anySchema?.safeParse === "function") {
            const result = anySchema.safeParse(args);
            return result.success
                ? { ok: true, value: result.data, validated: true }
                : {
                    ok: false,
                    issues: result.error?.issues ?? result.error,
                    value: args,
                };
        }

        if (typeof anySchema?.parse === "function") {
            return {
                ok: true,
                value: anySchema.parse(args),
                validated: true,
            };
        }

        const standard = anySchema?.["~standard"];
        if (standard && typeof standard.validate === "function") {
            const result = await standard.validate(args);
            if (result?.issues?.length) {
                return {
                    ok: false,
                    issues: result.issues,
                    value: args,
                };
            }
            return {
                ok: true,
                value: result?.value ?? args,
                validated: true,
            };
        }

        if (typeof anySchema?.validate === "function") {
            const result = await anySchema.validate(args);
            if (result?.success) {
                return {
                    ok: true,
                    value: result.value ?? args,
                    validated: true,
                };
            }
            return {
                ok: false,
                issues: result?.error ?? result?.issues,
                value: args,
            };
        }

        // AI SDK jsonSchema() 包装器：{ jsonSchema: ... }
        // MCP 工具的 inputSchema 通常以这种形式挂载，需要用 zod 的
        // fromJSONSchema 转成可校验 schema。转换失败时降级为不验证，
        // 不能假设所有 JSON Schema 特性都能被 zod 无损转换。
        const rawJsonSchema = await resolveJsonSchema(anySchema);
        if (rawJsonSchema) {
            const zodFromJson = tryFromJSONSchema(rawJsonSchema);
            if (zodFromJson) {
                const result = zodFromJson.safeParse(args);
                return result.success
                    ? { ok: true, value: result.data, validated: true }
                    : {
                        ok: false,
                        issues: result.error?.issues ?? result.error,
                        value: args,
                    };
            }
        }
    } catch (error) {
        return {
            ok: false,
            issues: error instanceof Error ? error.message : String(error),
            value: args,
        };
    }

    return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveJsonSchema(anySchema: any): Promise<unknown | null> {
    if (!anySchema || typeof anySchema !== "object") return null;

    // { jsonSchema: ... } 包装器（可能是 PromiseLike）
    if ("jsonSchema" in anySchema) {
        try {
            const js = await Promise.resolve(anySchema.jsonSchema);
            return js && typeof js === "object" ? js : null;
        } catch {
            return null;
        }
    }

    // 直接就是 JSON Schema 对象
    if (
        "type" in anySchema ||
        "properties" in anySchema ||
        "anyOf" in anySchema ||
        "oneOf" in anySchema
    ) {
        return anySchema;
    }

    return null;
}

function tryFromJSONSchema(jsonSchema: unknown): z.ZodType | null {
    const fn = (
        z as unknown as { fromJSONSchema?: (s: unknown) => z.ZodType }
    ).fromJSONSchema;
    if (typeof fn !== "function") return null;
    try {
        return fn(jsonSchema);
    } catch (error) {
        Logger.debug(
            "[ToolDB] z.fromJSONSchema 转换失败，跳过参数校验。",
            error,
        );
        return null;
    }
}

/**
 * 尝试修复模型传参的常见畸形。
 *
 * 覆盖：
 *   - 字符串化 JSON：'{"numbers":[1,3]}' → { numbers: [1,3] }
 *   - LLM 常见的语法畸形（缺引号、尾逗号、Python None/True、tuple 等），
 *     交给 json-repair-js 处理
 *   - null / undefined / 空字符串 → {}
 *
 * 不做：
 *   - 语义猜测（如字段名拼写错误、类型强制转换），
 *     这些留给 schema 校验失败后由模型自纠正。
 */
export function tryRepairArgs(args: unknown): {
    value: unknown;
    changed: boolean;
} {
    // 已经是对象：不碰，避免对合法参数做无意义的二次变换。
    if (args !== null && typeof args === "object") {
        return { value: args, changed: false };
    }

    if (typeof args === "string") {
        const trimmed = args.trim();
        if (!trimmed) {
            return { value: {}, changed: true };
        }

        try {
            const repaired = loads(trimmed);
            const sanitized = sanitizeParsed(repaired);
            // 原输入是字符串，只要修复后不是字符串，就是发生了修复。
            // 修复失败时 loads 通常返回原字符串，changed 为 false。
            const changed = typeof sanitized !== "string";
            if (changed) {
                Logger.debug(
                    "[ToolDB] args 经 json-repair-js 修复",
                    { original: args, repaired: sanitized },
                );
            }
            return { value: sanitized, changed };
        } catch (error) {
            Logger.debug(
                "[ToolDB] json-repair-js 修复失败，保留原始字符串。",
                error,
            );
            return { value: args, changed: false };
        }
    }

    if (args == null) {
        return { value: {}, changed: true };
    }

    return { value: args, changed: false };
}

/**
 * 净化解析结果，剔除 __proto__ 键，防止后续 spread/assign 造成原型污染。
 *
 * 只过滤 __proto__：这是唯一能通过普通对象写入改变原型链的键。
 * constructor / prototype 单独存在不构成原型污染，且作为工具参数名极罕见，
 * 不过度过滤以免误伤合法 schema。
 */
function sanitizeParsed(value: unknown): unknown {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(sanitizeParsed);

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === "__proto__") continue;
        out[k] = sanitizeParsed(v);
    }
    return out;
}

/**
 * 调用真实工具。
 *
 * - 代码工具（meta.execute）签名固定为 (input) => ...，不接收 signal；
 * - MCP 工具通过 AI SDK Tool.execute 调用，从 runner 上下文取 abortSignal
 *   透传给远端调用，使调用可被上游取消。
 */
export async function callRealTool(
    meta: ToolMeta,
    args: unknown,
): Promise<unknown> {
    if (typeof meta.execute === "function") {
        return await (meta.execute as (input: unknown) => unknown)(args);
    }

    const toolWithExecute = meta.tool as unknown as {
        execute?: (input: unknown, options: unknown) => Promise<unknown>;
    };

    if (typeof toolWithExecute.execute !== "function") {
        throw new Error(`工具 ${meta.id} 没有可执行入口。`);
    }

    const { signal } = getRunnerContext();

    return await toolWithExecute.execute(args, {
        toolCallId: `invoke_tool:${meta.llmName}:${randomUUID()}`,
        messages: [],
        abortSignal: signal,
    });
}