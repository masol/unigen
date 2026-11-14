// packages/main/src/libs/tooldb/to-ai-tool.ts
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import type { ToolMeta } from "./type.js";

/**
 * 判断一个值是否看起来是 AI SDK `asSchema` 可接受的 Schema 形态。
 *
 * AI SDK 的 `asSchema` 支持：
 *   - Zod 3 / Zod 4（有 `safeParse` / `parse` / `~standard.validate`）
 *   - `jsonSchema()` 包装（有 `~standard.validate`）
 *   - StandardSchema v1（有 `~standard.validate`）
 *
 * 只做结构判断，不做运行时验证；目的是在把工具交给 AI SDK 之前，
 * 发现明显不合法的手工构造对象（例如 { jsonSchema: ... }）。
 */
function looksLikeAiSdkSchema(schema: unknown): boolean {
    if (!schema || typeof schema !== "object") return false;
    const s = schema as Record<string, unknown>;

    if (typeof s.safeParse === "function") return true;
    if (typeof s.parse === "function") return true;

    const std = s["~standard"];
    if (
        std &&
        typeof std === "object" &&
        typeof (std as { validate?: unknown }).validate === "function"
    ) {
        return true;
    }

    return false;
}

/**
 * `ToolMeta.tool` 的统一出口。
 *
 * 目的：
 *   - 所有 "从 ToolMeta 取 tool" 的调用路径（编译期 `ref.meta`、运行期
 *     追加 tool 等）都经过这里，避免 MCP / 局部 MCP / builtin 三条构造
 *     路径各自直接使用 `meta.tool`；
 *   - 在交给 AI SDK 之前做一次结构校验，对明显非法的 `inputSchema` 形态
 *     （例如手工构造的 `{ jsonSchema: ... }`）打告警，便于定位问题。
 *
 * 行为承诺：
 *   - **不改变 `meta.tool` 引用**，调用方拿到的就是原 tool；
 *   - **不阻断调用**：校验失败只打日志，仍返回原 tool，保持原功能不变；
 *   - 不涉及 trace / 持久化 / 生命周期，纯读取。
 *
 * 未来若确认所有构造路径都已修正，可将校验升级为硬失败（返回 null）；
 * 在此之前保持"只告警"以确保任何既有工具不会被无声跳过。
 */
export function toAiTool(meta: ToolMeta): Tool {
    const t = meta.tool as unknown as Record<string, unknown> | undefined;
    if (!t || typeof t !== "object") {
        Logger.error(
            `[ToolDB] 工具 ${meta.id} 的 tool 不是对象，调用方将无法挂载。`,
            { source: meta.source },
        );
        return meta.tool;
    }

    // 兼容 AI SDK 新旧字段名：inputSchema（新） / parameters（旧）。
    const schema = t.inputSchema ?? t.parameters;
    if (schema === undefined || schema === null) {
        // 无参工具是合法的：AI SDK 允许省略 inputSchema。
        return meta.tool;
    }

    if (!looksLikeAiSdkSchema(schema)) {
        Logger.warn(
            `[ToolDB] 工具 ${meta.id} 的 inputSchema 不是 AI SDK 可识别的 Schema 形态，` +
            `调用时可能触发 "schema is not a function"。请检查构造路径（builtin / mcp / mcp_local）。`,
            {
                source: meta.source,
                serverId: meta.serverId,
                schemaType: typeof schema,
            },
        );
    }

    return meta.tool;
}