// packages/main/src/libs/tooldb/tools/meta-tools/validate.ts
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { randomUUID } from "node:crypto";
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
    } catch (error) {
        return {
            ok: false,
            issues: error instanceof Error ? error.message : String(error),
            value: args,
        };
    }

    return null;
}

export function tryRepairArgs(args: unknown): {
    value: unknown;
    changed: boolean;
} {
    if (typeof args === "string") {
        try {
            return { value: JSON.parse(args), changed: true };
        } catch {
            return { value: args, changed: false };
        }
    }

    if (args == null) {
        return { value: {}, changed: true };
    }

    return { value: args, changed: false };
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