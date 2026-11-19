// packages/main/src/libs/tooldb/tools/meta-tools/invoke.ts
import Logger from "electron-log/main.js";
import { z } from "zod";
import { buildAiTool } from "../../builder.js";
import { globalToolDB } from "../../globaltooldb.js";
import { builtinId } from "../../naming.js";
import type { ToolDefinition } from "../../type.js";
import { invokeToolName, searchToolsToolName } from "./names.js";
import {
    callRealTool,
    tryRepairArgs,
    validateToolArgs,
} from "./validate.js";

export { invokeToolName };

const invokeInputSchema = z.object({
    id: z
        .string()
        .min(1)
        .describe(
            "search_tools 返回的工具 id（不是 name，不是 llmName）。" +
            "id 形如 builtin::xxx / mcp::serverId::xxx，必须原样传入；" +
            "不要自行拼接、简写或猜测 serverId。",
        ),
    args: z
        .unknown()
        .describe(
            "真实工具的入参。必须是符合 search_tools 返回的 " +
            "invocation.inputSchema 的单个 JSON 对象；不要传字符串化 JSON。",
        ),
});

export type InvokeInput = z.infer<typeof invokeInputSchema>;

const searchToolMetaId = builtinId(searchToolsToolName);
const invokeToolMetaId = builtinId(invokeToolName);

interface InvokeSuccessOutput {
    ok: true;
    tool: { id: string; name: string };
    validated: boolean;
    repaired: boolean;
    result: unknown;
    /** 实际传给目标工具的 args（可能经过修复），仅为 toModelOutput 透传保留 */
    usedArgs: unknown;
}

interface InvokeFailureOutput {
    ok: false;
    tool?: { id: string; name: string };
    error: string;
    issues?: unknown;
    receivedArgs?: unknown;
    repairedArgs?: unknown;
    repaired?: boolean;
    hint?: string;
}

type InvokeExecuteOutput = InvokeSuccessOutput | InvokeFailureOutput;

export const invokeToolDef: ToolDefinition<InvokeInput, InvokeExecuteOutput> = {
    name: invokeToolName,
    description:
        "调用由 search_tools 发现的具体工具。args 为 unknown，" +
        "必须严格按照 search_tools 返回的 invocation.inputSchema 组织；" +
        "不要凭工具名猜测参数，不要把 args 传成字符串化 JSON。" +
        "id 必须使用 search_tools 返回的完整 id（形如 builtin::xxx / mcp::serverId::name），" +
        "不要用 name 或 llmName 代替。" +
        "参数会先验证，失败时会尝试修复；仍失败会返回 issues，" +
        "请据此重新组织 args 后再次调用 invoke_tool。",
    inputSchema: invokeInputSchema,
    execute: async ({ id, args }) => {
        const meta = await globalToolDB.getToolMeta(id);
        if (!meta) {
            return {
                ok: false,
                error: `未找到工具或引用有歧义: ${id}`,
                hint:
                    "请重新调用 search_tools 获取有效 id；" +
                    "重名工具必须使用 search_tools 返回的完整 id（mcp::serverId::name）。",
            };
        }

        if (meta.id === searchToolMetaId || meta.id === invokeToolMetaId) {
            return {
                ok: false,
                error: `不能通过 invoke_tool 调用元工具: ${meta.name}`,
                hint:
                    "search_tools / invoke_tool 由框架直接挂载，请直接调用它们，" +
                    "不要通过 invoke_tool 间接调用。",
            };
        }

        let currentArgs = args;
        let repaired = false;

        // 先做参数修复，再验证。
        // 模型常见的错误是把 args 传成字符串化 JSON（如 "{}"），
        // 若不先修复，后续验证对 MCP 工具可能不生效（validated: false），
        // 字符串会被原样传给 MCP server，导致参数反序列化失败。
        const repair = tryRepairArgs(currentArgs);
        if (repair.changed) {
            currentArgs = repair.value;
            repaired = true;
        }

        const validation = await validateToolArgs(meta, currentArgs);

        if (!validation.ok) {
            return {
                ok: false,
                tool: { id: meta.id, name: meta.name },
                error: "参数验证失败",
                issues: validation.issues,
                receivedArgs: args,
                repairedArgs: currentArgs,
                repaired,
                hint:
                    "请根据 search_tools 返回的 invocation.inputSchema 重新组织 args，" +
                    "确保是单个 JSON 对象并包含必填字段；然后再次调用 invoke_tool。",
            };
        }

        try {
            const result = await callRealTool(meta, validation.value);

            // MCP 工具在执行失败时返回 { content: [...], isError: true }，
            // 而不是抛异常。必须显式识别并映射为 ok: false，
            // 否则模型会把错误当作成功，永远看不到 content 中的恢复提示。
            if (
                meta.source === "mcp" &&
                result !== null &&
                typeof result === "object" &&
                (result as { isError?: unknown }).isError === true
            ) {
                return {
                    ok: false,
                    tool: { id: meta.id, name: meta.name },
                    error:
                        extractMcpErrorText(result) ||
                        "MCP 工具返回 isError: true",
                    hint:
                        "MCP 工具报告执行失败。请阅读 error 中的提示，" +
                        "修正参数或调整策略后重试；不要用相同参数重复提交。",
                };
            }

            return {
                ok: true,
                tool: { id: meta.id, name: meta.name },
                validated: validation.validated,
                repaired,
                result,
                usedArgs: validation.value,
            };
        } catch (error) {
            return {
                ok: false,
                tool: { id: meta.id, name: meta.name },
                error: error instanceof Error ? error.message : String(error),
                hint:
                    "工具执行失败。请检查参数是否符合调用规范，或改用其他工具；" +
                    "不要用相同参数重复提交。",
            };
        }
    },
    toModelOutput: async ({ output }) => {
        const out = output as InvokeExecuteOutput;

        // 失败路径：直接回 JSON。
        // InvokeFailureOutput 是我们自己定义的结构，没有 JSONValue 的索引签名，
        // 需要显式 cast 以满足 ToolResultOutput 的 { type: "json", value: JSONValue }。
        if (!out.ok) {
            return {
                type: "json",
                value: out as never,
            };
        }

        // 成功路径：优先透传目标工具自身的 toModelOutput。
        //
        // 这是 invoke_tool 让 read_file / read_attachment 的多模态输出
        // （图片 image block 等）能穿过 invoke_tool 的关键；
        // 若这里直接回 JSON，二进制会被序列化成数字数组，模型无法视觉解析。
        try {
            const meta = await globalToolDB.getToolMeta(out.tool.id);
            const rawToModelOutput = (
                meta?.tool as { toModelOutput?: unknown } | undefined
            )?.toModelOutput;

            if (typeof rawToModelOutput === "function") {
                const fn = rawToModelOutput as (opts: {
                    toolCallId: string;
                    input: unknown;
                    output: unknown;
                }) => unknown | Promise<unknown>;

                const formatted = await fn({
                    toolCallId: `invoke_tool:${out.tool.id}`,
                    input: out.usedArgs,
                    output: out.result,
                });

                if (formatted) {
                    // 目标工具的 toModelOutput 返回的已是 ToolResultOutput；
                    // 这里 unknown → ToolResultOutput 的契约由目标工具自身保证。
                    return formatted as never;
                }
            }
        } catch (error) {
            Logger.warn(
                `[ToolDB] invoke_tool: 透传 ${out.tool.id} 的 toModelOutput 失败，降级为 JSON。`,
                error,
            );
        }

        // fallback：剥除内部字段 usedArgs，其余字段原样保留。
        // 与失败路径同理，自定义结构需要 cast 以满足 { value: JSONValue }。
        return {
            type: "json",
            value: {
                ok: true,
                tool: out.tool,
                validated: out.validated,
                repaired: out.repaired,
                result: out.result,
            } as never,
        };
    },
};

function extractMcpErrorText(result: unknown): string {
    if (result === null || typeof result !== "object") return "";

    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
        return content
            .map((c) => {
                if (c && typeof c === "object" && "text" in c) {
                    return String((c as { text: unknown }).text ?? "");
                }
                return "";
            })
            .filter(Boolean)
            .join("\n");
    }
    if (typeof content === "string") return content;
    return "";
}

export const invokeTool = buildAiTool(invokeToolDef);