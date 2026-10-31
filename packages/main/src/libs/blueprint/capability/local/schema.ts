import { throwPrecondition } from "$libs/utils/err.js";
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import { z } from "zod";
import type { ToolRef } from "./type.js";

/* ============================================================================
 * 对外导出(本文件共三个入口)
 *   - jsonSchemaToZod       编译期将 front matter 的 inputs/outputs 转为 Zod
 *   - renderOutputSemantics 把 outputs 转为"最终回复要点"追加到子 agent 自身 prompt
 *   - buildToolDoc          生成工具目录(父 agent 的 {{_BI_tool}})
 * ========================================================================== */

/**
 * JSON Schema → Zod。依赖 zod >= 4.3.0 的原生 z.fromJSONSchema()。
 */
export function jsonSchemaToZod(
    raw: Record<string, unknown> | undefined,
    field: "inputs" | "outputs",
    sourcePath: string,
): z.ZodObject<z.ZodRawShape> {
    const empty = z.object({});

    if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) {
        return empty;
    }

    if (typeof z.fromJSONSchema !== "function") {
        throwPrecondition(
            `[PAC] z.fromJSONSchema 不可用,请升级 zod 至 >= 4.3.0 (${sourcePath})`,
        );
    }

    try {
        const schema = z.fromJSONSchema(raw as never);
        if (schema instanceof z.ZodType) {
            if (schema instanceof z.ZodObject) return schema;
            throwPrecondition(
                `[PAC] front matter.${field} 必须是 JSON Schema object 类型 (${sourcePath})`,
            );
        }
        throwPrecondition(
            `[PAC] front matter.${field} 无法转换为 Zod (${sourcePath})`,
        );
    } catch (e) {
        if (e instanceof Error && e.message.startsWith("[PAC]")) throw e;
        throwPrecondition(
            `[PAC] front matter.${field} 转换失败: ${e instanceof Error ? e.message : String(e)} (${sourcePath})`,
        );
    }
    return empty; // unreachable
}

/**
 * 把 outputs schema 转为"最终回复要点清单"。
 *
 * 由 compiler 在编译期拼到 agent 自身 systemTemplate 末尾,指引 LLM
 * 在自然语言回复中覆盖这些要点,而不是强制返回 JSON。
 *
 * 实证:强制结构化输出会显著降低 LLM 推理质量,它要兼顾业务和序列化。
 * 以"覆盖要点"的方式引导更稳,也让父 agent 的 LLM 读文本比反序列化更自然。
 *
 * @returns markdown 列表(不含标题);若 schema 为空或非 object,返回 null
 */
export function renderOutputSemantics(outputSchema: unknown): string | null {
    const json = normalizeToJsonSchema(outputSchema);
    const lines = renderObjectFields(json, 0, "output");
    if (lines.length === 0) return null;
    return lines.join("\n");
}

/**
 * 生成工具目录(markdown)。空 refs 时返回占位提示。
 *
 * 本函数不写二级标题,由调用方(模板作者或 compiler 自动追加)负责,
 * 避免 "## 可用工具 + {{_BI_tool}}" 展开后双标题。
 *
 * 返回语义的两种展示方式:
 *   - 子 agent(LLM-backed):以"覆盖以下要点"方式列字段,返回是一段文本;
 *   - 非 LLM 工具(builtin / MCP / search):按字段列表展示,返回是结构化对象。
 */
export function buildToolDoc(refs: ToolRef[]): string {
    if (refs.length === 0) {
        return "_当前 agent 未声明任何工具。_";
    }

    const sections: string[] = [TOOL_DOC_PREAMBLE];

    for (const ref of refs) {
        const extTool: Tool | null = ref.meta?.tool ?? null;
        const isAgent = !!ref.agent;

        const description =
            (ref.agent?.description ?? "").trim() ||
            (readToolDescription(extTool) ?? "").trim() ||
            "_未提供描述_";

        const inRaw =
            ref.agent?.inputSchema ??
            (ref.meta as { inputSchema?: unknown } | null | undefined)?.inputSchema ??
            (extTool as { inputSchema?: unknown } | null)?.inputSchema;
        const inJson = normalizeToJsonSchema(inRaw);

        const outRaw =
            ref.agent?.outputSchema ??
            (ref.meta as { outputSchema?: unknown } | null | undefined)?.outputSchema ??
            (extTool as { outputSchema?: unknown } | null)?.outputSchema;
        const outJson = normalizeToJsonSchema(outRaw);

        const lines: string[] = [];
        lines.push(`### \`${ref.key}\``);
        lines.push("");
        lines.push(description);
        lines.push("");

        const paramLines = renderObjectFields(inJson, 0, "input");
        if (paramLines.length > 0) {
            lines.push("**调用参数**(作为单一对象传入,字段如下):");
            lines.push("");
            lines.push(paramLines.join("\n"));
        } else {
            lines.push("**调用参数**:无字段,传入空对象 `{}` 即可。");
        }

        const retLines = renderObjectFields(outJson, 0, "output");
        if (isAgent) {
            lines.push("");
            if (retLines.length > 0) {
                lines.push("**返回**:一段文本(通常为自然语言汇报,无需解析),内容应涵盖以下要点:");
                lines.push("");
                lines.push(retLines.join("\n"));
            } else {
                lines.push("**返回**:一段文本(自然语言汇报,直接阅读理解)。");
            }
        } else if (retLines.length > 0) {
            lines.push("");
            lines.push("**返回**(单一对象,字段如下):");
            lines.push("");
            lines.push(retLines.join("\n"));
        }

        sections.push(lines.join("\n"));
    }

    return sections.join("\n\n").trimEnd();
}

/* ============================================================================
 * 内部实现
 * ========================================================================== */

/**
 * 工具目录开头的"调用约定"说明。统一告诉父 LLM 三件事:
 *   1. 调用参数以单一对象形式传入(即使只有一个字段);
 *   2. 工具若失败会以异常形式返回,错误消息自动进入对话上下文;
 *   3. 子 agent 类工具返回一段文本,直接阅读理解即可,无需解析。
 */
const TOOL_DOC_PREAMBLE =
    "**调用约定**:" +
    "调用参数一律作为**单一对象**传入(即使只有一个字段);" +
    "工具若执行失败会以**异常**形式返回,错误消息会自动进入你的对话上下文," +
    "你据此决策重试或改走其它路径即可,无需自己构造错误消息;" +
    "子 agent 类工具返回**一段文本**(通常是自然语言汇报),直接阅读理解即可。";

interface SchemaNode {
    type?: string;
    enum?: unknown[];
    items?: SchemaNode;
    properties?: Record<string, SchemaNode>;
    required?: string[];
    description?: string;
    anyOf?: SchemaNode[];
    oneOf?: SchemaNode[];
    jsonSchema?: SchemaNode;
    [key: string]: unknown;
}

/** Zod → 普通 JSON Schema 对象;失败返回 null */
function zodToJsonSchema(schema: unknown): SchemaNode | null {
    if (!schema) return null;
    if (typeof z.toJSONSchema !== "function") {
        Logger.warn("[PAC] z.toJSONSchema 不可用,工具目录将省略 schema");
        return null;
    }
    try {
        const r = z.toJSONSchema(schema as z.ZodType, { io: "input" });
        return r && typeof r === "object" ? (r as SchemaNode) : null;
    } catch (e) {
        Logger.warn(`[PAC] schema 转 JSON Schema 失败(工具目录将省略):`, e);
        return null;
    }
}

/**
 * 把"可能是 Zod,也可能是 JSON Schema,也可能是 AI SDK jsonSchema() 包装"
 * 的值规范化为普通 JSON Schema 对象,供渲染器消费。
 */
function normalizeToJsonSchema(schema: unknown): SchemaNode | null {
    if (!schema) return null;
    if (schema instanceof z.ZodType) {
        return zodToJsonSchema(schema);
    }
    if (typeof schema === "object") {
        const obj = schema as SchemaNode;
        if (obj.jsonSchema && typeof obj.jsonSchema === "object") {
            return obj.jsonSchema;
        }
        if ("type" in obj || "properties" in obj || "anyOf" in obj || "oneOf" in obj) {
            return obj;
        }
    }
    return null;
}

/** schema 节点 → 紧凑类型表达式(TS 风格) */
function typeExpr(schema: SchemaNode | null | undefined): string {
    if (!schema) return "any";

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
        return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
    }

    const union = schema.anyOf ?? schema.oneOf;
    if (Array.isArray(union) && union.length > 0) {
        const parts = union.map((s) => typeExpr(s)).filter((s) => s && s !== "any");
        if (parts.length > 0) return parts.join(" | ");
    }

    const t = schema.type;
    if (t === "array") {
        const items = schema.items ?? {};
        if (items.type === "object") return "object[]";
        if (Array.isArray(items.enum) && items.enum.length > 0) {
            return `(${items.enum.map((v) => JSON.stringify(v)).join(" | ")})[]`;
        }
        return `${items.type ?? "any"}[]`;
    }
    if (t === "object") return "object";
    return typeof t === "string" ? t : "any";
}

/**
 * 对象 schema → markdown 列表。
 *
 * - context "input":所有字段都标 必填/选填,帮助调用方 LLM 组装对象时不漏项
 * - context "output":必有字段只给类型,只对可选字段标 选填,减少噪音
 */
function renderObjectFields(
    schema: SchemaNode | null | undefined,
    indent: number,
    context: "input" | "output",
): string[] {
    if (!schema || schema.type !== "object" || !schema.properties) return [];

    const required = new Set<string>(
        Array.isArray(schema.required) ? schema.required : [],
    );
    const pad = "  ".repeat(indent);
    const out: string[] = [];

    for (const [key, field] of Object.entries(schema.properties)) {
        if (!field || typeof field !== "object") continue;

        const type = typeExpr(field);
        const desc = typeof field.description === "string" ? field.description.trim() : "";
        const isRequired = required.has(key);

        const label =
            context === "input"
                ? `(${type}, ${isRequired ? "必填" : "选填"})`
                : isRequired
                    ? `(${type})`
                    : `(${type}, 选填)`;

        const isObjectNest = field.type === "object" && !!field.properties;
        const isArrayOfObject =
            field.type === "array" &&
            !!field.items &&
            field.items.type === "object" &&
            !!field.items.properties;

        if (isObjectNest) {
            const suffix = desc ? `: ${desc},含:` : ",含:";
            out.push(`${pad}- \`${key}\` ${label}${suffix}`);
            out.push(...renderObjectFields(field, indent + 1, context));
        } else if (isArrayOfObject && field.items) {
            const suffix = desc ? `: ${desc},每项含:` : ",每项含:";
            out.push(`${pad}- \`${key}\` ${label}${suffix}`);
            out.push(...renderObjectFields(field.items, indent + 1, context));
        } else {
            const suffix = desc ? `: ${desc}` : "";
            out.push(`${pad}- \`${key}\` ${label}${suffix}`);
        }
    }

    return out;
}

function readToolDescription(tool: Tool | null): string | undefined {
    if (!tool) return undefined;
    const d = (tool as { description?: unknown }).description;
    if (typeof d === "string") return d;
    if (typeof d === "function") {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = (d as (o: any) => unknown)({ context: undefined });
            return typeof r === "string" ? r : undefined;
        } catch {
            return undefined;
        }
    }
    return undefined;
}