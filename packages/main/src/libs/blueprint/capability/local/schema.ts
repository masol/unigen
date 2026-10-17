import { throwPrecondition } from "$libs/utils/err.js";
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import { z } from "zod";
import type { ToolRef } from "./type.js";

/**
 * JSON Schema → Zod。
 *
 * 依赖 zod >= 4.3.0 的原生 z.fromJSONSchema()(支持 draft-07 / draft-2020-12)。
 * 无需引入 json-schema-to-zod 这类第三方包,也无需 eval 生成的代码。
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
        // 直接使用用户给出的 draft,不覆盖 $schema;zod 会自行识别版本
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

/** Zod → JSON Schema,仅用于生成工具目录文档;失败返回 null */
function zodToJsonSchema(schema: unknown): unknown {
    if (!schema) return null;
    try {
        return z.toJSONSchema(schema as z.ZodType, { io: "input" });
    } catch (e) {
        Logger.warn(`[PAC] schema 转 JSON Schema 失败(工具目录将省略):`, e);
        return null;
    }
}

function fenced(v: unknown): string {
    if (v === null || v === undefined) return "_未声明_";
    return "```json\n" + JSON.stringify(v, null, 2) + "\n```";
}

function firstLine(s: string, max = 100): string {
    const line = (s ?? "").trim().split("\n")[0] ?? "";
    return line.length > max ? line.slice(0, max) + "…" : line;
}

/**
 * 生成工具目录(markdown)。
 *
 * 同时服务于两个目的:
 *  1. 作为 {{_BI_tool}} 变量注入正文;
 *  2. 当正文没有引用 {{_BI_tool}} 时,由 compiler 追加到正文末尾 ——
 *     因为 PAC 的工具信息不在正文里,必须显式告诉 LLM 有哪些工具可用。
 */
export function buildToolDoc(refs: ToolRef[]): string {
    if (refs.length === 0) {
        return "_当前 agent 未声明任何工具。_";
    }

    const lines: string[] = ["## 可用工具", ""];

    for (const ref of refs) {
        const isAgent = ref.origin === "agent";
        lines.push(`### \`${ref.key}\``);
        lines.push("");

        // 描述:agent 取 front matter.description,外部工具取 AI SDK 的 description
        const desc =
            ref.agent?.description ??
            readToolDescription(ref.tool) ??
            "_未提供描述_";
        lines.push(firstLine(desc));
        lines.push("");

        if (isAgent && ref.agent) {
            lines.push(`- 类型:子 agent(\`${ref.agent.sourcePath}\`)`);
            lines.push(`- 最大步数: ${ref.agent.config.maxSteps ?? 10}`);
        } else {
            lines.push(`- 类型:${ref.origin}`);
        }
        lines.push("");

        // 参数
        const inSchema =
            ref.agent?.inputSchema ?? (ref.tool as { inputSchema?: unknown })?.inputSchema;
        lines.push("**参数:**");
        lines.push("");
        lines.push(fenced(zodToJsonSchema(inSchema)));
        lines.push("");

        // 返回
        const outSchema =
            ref.agent?.outputSchema ?? (ref.tool as { outputSchema?: unknown })?.outputSchema;
        if (outSchema) {
            lines.push("**返回:**");
            lines.push("");
            lines.push(fenced(zodToJsonSchema(outSchema)));
            lines.push("");
        }
    }

    return lines.join("\n").trimEnd();
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