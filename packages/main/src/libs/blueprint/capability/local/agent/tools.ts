// file: agent/tools.ts
import { globalToolDB, toAiTool } from "$libs/tooldb/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { tool, type Tool } from "ai";
import Logger from "electron-log/main.js";
import { connectLocalMcp, type LocalMcpClient } from "../mcp.js";
import type { CompiledPacAgent, JsonValue } from "../type.js";
import { attachLocalContextTools } from "./context-tools.js";
import type { IAgentExecutor, McpClientCache, PacRunState } from "./types.js";

export async function materializeTools(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    parentDefaults: Record<string, JsonValue>,
    mcpClients: McpClientCache,
    parentStepPath: string,
    state: PacRunState,
    parentTraceId: string,
    agentExecutor: IAgentExecutor,
    extraToolIds?: string[],
    extraSkillIds?: string[],
): Promise<Record<string, Tool>> {
    const out: Record<string, Tool> = {};
    for (let i = 0; i < compiled.toolRefs.length; i++) {
        const ref = compiled.toolRefs[i];
        const childStepPath = `${parentStepPath}.${i + 1}`;

        if (ref.agent) {
            out[ref.key] = buildAgentTool(
                ref.agent,
                ctx,
                parentDefaults,
                mcpClients,
                childStepPath,
                state,
                parentTraceId,
                agentExecutor,
            );
        } else if (ref.local) {
            // 编译产物不持有 prj；需要 prj 的工具(skill)在运行期通过 build(ctx.prj) 构造。
            if (ref.local.tool) {
                out[ref.key] = ref.local.tool;
            } else if (ref.local.build) {
                out[ref.key] = ref.local.build(ctx.prj);
            } else {
                Logger.warn(
                    `[PAC] ${compiled.name}: local 工具 ${ref.key} 既无 tool 也无 build，本次运行跳过`,
                );
            }
        } else if (ref.mcpLocal) {
            const { config, tool: info } = ref.mcpLocal;

            // 缓存 Promise 而不是 client：并行子 agent 同时物化同一局部 MCP 时，
            // 只有第一个会真正发起连接，其余等待同一个 Promise。
            let pending = mcpClients.get(config);
            if (!pending) {
                pending = connectLocalMcp(config);
                mcpClients.set(config, pending);
            }

            let client: LocalMcpClient;
            try {
                client = await pending;
            } catch (e) {
                mcpClients.delete(config);
                Logger.error(
                    `[PAC] ${compiled.name}: 局部 MCP 连接失败,跳过工具 ${ref.key}`,
                    e,
                );
                continue;
            }

            const tools = (await client.tools()) as Record<string, Tool>;
            const t = tools[info.name];
            if (t) {
                out[ref.key] = t;
            } else {
                Logger.warn(
                    `[PAC] ${compiled.name}: 局部 MCP 工具 ${info.name} 未找到,跳过`,
                );
            }
        } else if (ref.meta) {
            const live = await globalToolDB.getToolMeta(ref.meta.id);
            if (live) {
                out[ref.key] = toAiTool(live);
            } else {
                Logger.warn(
                    `[PAC] ${compiled.name}: 工具 ${ref.meta.id} 已不在工具库中` +
                    `(MCP server 断开或被移除?),本次运行跳过`,
                );
            }
        }
    }

    // 运行期追加工具：仅根 agent 会传入。字符串直接作为全局工具 id 查询，
    // 不解析 builtin:: / mcp:: 等前缀。
    if (extraToolIds && extraToolIds.length > 0) {
        const seen = new Set<string>();
        for (const rawId of extraToolIds) {
            if (typeof rawId !== "string") continue;

            const id = rawId.trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);

            try {
                const live = await globalToolDB.getToolMeta(id);
                if (!live) {
                    Logger.warn(
                        `[PAC] ${compiled.name}: 运行期追加工具 ${id} 不存在，本次运行跳过`,
                    );
                    continue;
                }

                const key = live.llmName || id;
                if (out[key]) {
                    Logger.warn(
                        `[PAC] ${compiled.name}: 运行期追加工具 ${id} 的调用名 ${key} 已被占用，本次运行跳过`,
                    );
                    continue;
                }

                out[key] = toAiTool(live);
            } catch (e) {
                Logger.warn(
                    `[PAC] ${compiled.name}: 运行期追加工具 ${id} 失败，本次运行跳过`,
                    e,
                );
            }
        }
    }

    await attachLocalContextTools(out, compiled, ctx, extraSkillIds);

    return out;
}

export function buildAgentTool(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    inheritedDefaults: Record<string, JsonValue> = {},
    mcpClients: McpClientCache,
    stepPath: string,
    state: PacRunState,
    parentTraceId: string,
    agentExecutor: IAgentExecutor,
): Tool {
    const execute = async (input: unknown): Promise<string> => {
        return agentExecutor.runSubAgent(
            compiled,
            ctx,
            (input && typeof input === "object" && !Array.isArray(input)
                ? input
                : {}) as Record<string, unknown>,
            inheritedDefaults,
            { stepPath, parentTraceId },
            mcpClients,
            state,
        );
    };
    return tool({
        description: compiled.description,
        inputSchema: compiled.inputSchema,
        execute,
    });
}

export async function closeLocalMcpClients(
    mcpClients: McpClientCache,
): Promise<void> {
    for (const [, pending] of mcpClients) {
        try {
            const client = await pending;
            await client.close();
        } catch (e) {
            Logger.warn(`[PAC] 关闭局部 MCP 连接失败:`, e);
        }
    }
    mcpClients.clear();
}