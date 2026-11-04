// packages/main/src/libs/blueprint/capability/local/agent/core.ts

import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { LocalMcpClient } from "../mcp.js";
import type { CompiledPacAgent, IPacAgent, JsonValue, LocalMcpConfig } from "../type.js";
import { executeAgent } from "./execution.js";
import { closeLocalMcpClients } from "./tools.js";
import { TraceIdRegistry, type IAgentExecutor, type PacRunState, type RunOptions } from "./types.js";

export class PacAgent implements IPacAgent, IAgentExecutor {
    constructor(private readonly compiled: CompiledPacAgent) { }

    getCompiled(): CompiledPacAgent {
        return this.compiled;
    }

    async run(ctx: IRunnerContext): Promise<string> {
        const mcpClients = new Map<LocalMcpConfig, LocalMcpClient>();
        try {
            const prjdb = PrjDB.ensure(ctx.prj);
            const messageId = prjdb.saveMessage({
                sessionId: ctx.sessId,
                role: "assistant",
                content: "",
            });

            const state: PacRunState = {
                messageId,
                counters: new Map(),
                thinkingStates: new Map(),
                idRegistry: new TraceIdRegistry(),
            };

            const result = await executeAgent(
                this.compiled,
                ctx,
                prjdb,
                this.inputsFromCtx(ctx),
                {},
                { validateInputs: false, isRoot: true, stepPath: "1" },
                mcpClients,
                state,
                this,
            );

            return result.text;
        } finally {
            await closeLocalMcpClients(mcpClients);
        }
    }

    async runWithInputs(
        ctx: IRunnerContext,
        rawInputs: Record<string, unknown>,
        inheritedDefaults: Record<string, JsonValue> = {},
        options: RunOptions = {},
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
        state?: PacRunState,
    ): Promise<string> {
        const prjdb = PrjDB.ensure(ctx.prj);

        if (!state) {
            const messageId = prjdb.saveMessage({
                sessionId: ctx.sessId,
                role: "assistant",
                content: "",
            });
            state = {
                messageId,
                counters: new Map(),
                thinkingStates: new Map(),
                idRegistry: new TraceIdRegistry(),
            };
        }

        const result = await executeAgent(
            this.compiled,
            ctx,
            prjdb,
            rawInputs,
            inheritedDefaults,
            options,
            mcpClients,
            state,
            this,
        );

        return result.text;
    }

    /**
     * 子 agent 执行入口（实现 IAgentExecutor 接口）
     */
    async runSubAgent(
        compiled: CompiledPacAgent,
        ctx: IRunnerContext,
        inputs: Record<string, unknown>,
        inheritedDefaults: Record<string, JsonValue>,
        options: RunOptions,
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
        state: PacRunState,
    ): Promise<string> {
        const subAgent = new PacAgent(compiled);
        return subAgent.runWithInputs(ctx, inputs, inheritedDefaults, options, mcpClients, state);
    }

    private inputsFromCtx(ctx: IRunnerContext): Record<string, unknown> {
        const args = ctx.cmd?.args;
        if (!args || typeof args !== "object" || Array.isArray(args)) {
            return {};
        }
        return { ...(args as Record<string, unknown>) };
    }
}