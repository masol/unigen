// packages/main/src/libs/tooldb/tools/meta-tools/schema.ts
import Logger from "electron-log/main.js";
import { z } from "zod";
import type { ToolMeta } from "../../type.js";

export interface SchemaNode {
    type?: string;
    enum?: unknown[];
    items?: SchemaNode;
    properties?: Record<string, SchemaNode>;
    required?: string[];
    description?: string;
    anyOf?: SchemaNode[];
    oneOf?: SchemaNode[];
    jsonSchema?: SchemaNode | PromiseLike<SchemaNode>;
    [key: string]: unknown;
}

/**
 * zod schema → 普通 JSON Schema。
 * 使用 zod 官方 z.toJSONSchema；失败返回 null，不阻断检索。
 */
function zodToJsonSchema(schema: z.ZodType): SchemaNode | null {
    if (typeof z.toJSONSchema !== "function") {
        Logger.warn(
            "[ToolDB] z.toJSONSchema 不可用，调用规范将省略 schema。",
        );
        return null;
    }

    try {
        const r = z.toJSONSchema(schema, { io: "input" });
        return r && typeof r === "object" ? (r as SchemaNode) : null;
    } catch (error) {
        Logger.warn(
            "[ToolDB] zod schema 转 JSON Schema 失败，调用规范将省略。",
            error,
        );
        return null;
    }
}

/**
 * 把“可能是 Zod、可能是普通 JSON Schema、也可能是 AI SDK jsonSchema() 包装”
 * 的值规范化为普通 JSON Schema 对象。
 *
 * AI SDK 包装的 .jsonSchema 可能是对象，也可能是 PromiseLike（惰性 schema）。
 */
export async function normalizeToJsonSchema(
    schema: unknown,
): Promise<SchemaNode | null> {
    if (!schema) return null;

    if (schema instanceof z.ZodType) {
        return zodToJsonSchema(schema);
    }

    if (typeof schema !== "object") return null;

    const obj = schema as SchemaNode;

    if ("jsonSchema" in obj) {
        try {
            const js = await Promise.resolve(obj.jsonSchema);
            return js && typeof js === "object" ? js : null;
        } catch (error) {
            Logger.warn(
                "[ToolDB] 读取工具 JSON Schema 失败，调用规范将省略。",
                error,
            );
            return null;
        }
    }

    if (
        "type" in obj ||
        "properties" in obj ||
        "anyOf" in obj ||
        "oneOf" in obj
    ) {
        return obj;
    }

    return null;
}

export async function describeSchema(
    schema: unknown,
): Promise<SchemaNode | null> {
    return normalizeToJsonSchema(schema);
}

export function getInputSchema(meta: ToolMeta): unknown {
    return (
        meta.inputSchema ??
        (meta.tool as unknown as { inputSchema?: unknown }).inputSchema
    );
}

export function getOutputSchema(meta: ToolMeta): unknown {
    return (
        meta.outputSchema ??
        (meta.tool as unknown as { outputSchema?: unknown }).outputSchema
    );
}