// file: agent/tools.ts
import { globalToolDB } from "$libs/tooldb/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { tool, type Tool } from "ai";
import Logger from "electron-log/main.js";
import { connectLocalMcp, type LocalMcpClient } from "../mcp.js";
import type { CompiledPacAgent, JsonValue, LocalMcpConfig } from "../type.js";
import type { IAgentExecutor, PacRunState } from "./types.js";

export async function materializeTools(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    parentDefaults: Record<string, JsonValue>,
    mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
    parentStepPath: string,
    state: PacRunState,
    parentTraceId: string,
    agentExecutor: IAgentExecutor,
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
            let client = mcpClients.get(config);
            if (!client) {
                try {
                    client = await connectLocalMcp(config);
                    mcpClients.set(config, client);
                } catch (e) {
                    Logger.error(
                        `[PAC] ${compiled.name}: 局部 MCP 连接失败,跳过工具 ${ref.key}`,
                        e,
                    );
                    continue;
                }
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
            const live = globalToolDB.getToolMeta(ref.meta.id);
            if (live) {
                out[ref.key] = live.tool;
            } else {
                Logger.warn(
                    `[PAC] ${compiled.name}: 工具 ${ref.meta.id} 已不在工具库中` +
                    `(MCP server 断开或被移除?),本次运行跳过`,
                );
            }
        }
    }
    return out;
}

export function buildAgentTool(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    inheritedDefaults: Record<string, JsonValue> = {},
    mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
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
    mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
): Promise<void> {
    for (const [, client] of mcpClients) {
        try {
            await client.close();
        } catch (e) {
            Logger.warn(`[PAC] 关闭局部 MCP 连接失败:`, e);
        }
    }
    mcpClients.clear();
}