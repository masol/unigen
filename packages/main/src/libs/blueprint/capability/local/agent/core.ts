// packages/main/src/libs/blueprint/capability/local/agent/core.ts

import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { randomUUID } from "node:crypto";
import { resolveEffectiveSettings } from "../settings.js";
import type { CompiledPacAgent, IPacAgent, JsonValue } from "../type.js";
import { executeAgent } from "./execution.js";
import { closeLocalMcpClients } from "./tools.js";
import {
    TraceIdRegistry,
    type IAgentExecutor,
    type McpClientCache,
    type PacRunState,
    type RunOptions,
} from "./types.js";

export class PacAgent implements IPacAgent, IAgentExecutor {
    private runAsRoot: boolean;

    constructor(
        private readonly compiled: CompiledPacAgent,
        runAsRoot = true,
    ) {
        this.runAsRoot = runAsRoot;
    }

    /**
     * 设置本 PacAgent 是否以根 agent 身份运行。
     *
     * 由 PACFunctor 在运行前根据外部标志同步。为 false 时：
     * - executeAgent 的 isRoot 恒为 false，不发送 message.start / message.delta /
     *   message.end，不写 message 表，正文与生命周期汇报走 trace；
     * - 不创建 assistant 占位消息；
     * - 不持久化 trace 到独立 messageId 下（非根 agent 没有父 messageId 可挂，
     *   写入只会产生孤立数据），但仍会通过 ctx.report 发送实时 trace 事件。
     */
    setRunAsRoot(value: boolean): void {
        this.runAsRoot = value;
    }

    getCompiled(): CompiledPacAgent {
        return this.compiled;
    }

    /**
     * 收集当前 agent 树中所有 front matter.requireModel 的去重数组。
     * 顺序为：根 agent 优先，然后按 toolRefs 深度优先顺序。
     */
    getRequireModels(): string[] {
        const out: string[] = [];
        const seen = new Set<string>();
        const visited = new Set<CompiledPacAgent>();

        const walk = (agent: CompiledPacAgent): void => {
            if (visited.has(agent)) return;
            visited.add(agent);

            const req = agent.config.requireModel?.trim();
            if (req && !seen.has(req)) {
                seen.add(req);
                out.push(req);
            }

            for (const ref of agent.toolRefs) {
                if (ref.agent) walk(ref.agent);
            }
        };

        walk(this.compiled);
        return out;
    }

    async run(ctx: IRunnerContext): Promise<string> {
        const mcpClients: McpClientCache = new Map();
        try {
            const prjdb = PrjDB.ensure(ctx.prj);
            const runAsRoot = this.runAsRoot;
            // 非根 agent（由外部 PACFunctor 作为子能力调用）不应创建 assistant 消息，
            // 也不应持久化 trace 到独立 messageId 下：它没有父 messageId 可挂，
            // 写入只会产生孤立的空消息/孤立 trace。实时事件仍通过 ctx.report 发出。
            const persist = runAsRoot
                && resolveEffectiveSettings(this.compiled.settings, ctx.settings).persist;
            const messageId = this.createAssistantMessageId(prjdb, ctx, persist);

            const state: PacRunState = {
                messageId,
                counters: new Map(),
                thinkingStates: new Map(),
                idRegistry: new TraceIdRegistry(),
                subAgentHistories: new Map(),
                persist,
            };

            const result = await executeAgent(
                this.compiled,
                ctx,
                prjdb,
                this.inputsFromCtx(ctx),
                {},
                { validateInputs: false, isRoot: runAsRoot, stepPath: "1" },
                mcpClients,
                state,
                this,
            );

            return result.text;
        } finally {
            await closeLocalMcpClients(mcpClients);
        }
    }

    // PacAgent.runWithInputs 在 state 省略时仍未参考 this.runAsRoot。目前该路径实际只被 runSubAgent 以传入 state 的方式使用，因此不影响当前功能。若未来外部直接调用 runWithInputs 且省略 state，建议同样用 this.runAsRoot 控制 persist 与 isRoot。
    async runWithInputs(
        ctx: IRunnerContext,
        rawInputs: Record<string, unknown>,
        inheritedDefaults: Record<string, JsonValue> = {},
        options: RunOptions = {},
        mcpClients: McpClientCache,
        state?: PacRunState,
    ): Promise<string> {
        const prjdb = PrjDB.ensure(ctx.prj);

        if (!state) {
            const persist = resolveEffectiveSettings(this.compiled.settings, ctx.settings).persist;
            const messageId = this.createAssistantMessageId(prjdb, ctx, persist);
            state = {
                messageId,
                counters: new Map(),
                thinkingStates: new Map(),
                idRegistry: new TraceIdRegistry(),
                subAgentHistories: new Map(),
                persist,
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
        mcpClients: McpClientCache,
        state: PacRunState,
    ): Promise<string> {
        // 子 agent 在语义上永远不是根 agent；runWithInputs 会复用父 state，
        // 这里显式传 false 以保持语义清晰，避免未来误用 runAsRoot 时出错。
        const subAgent = new PacAgent(compiled, false);
        return subAgent.runWithInputs(ctx, inputs, inheritedDefaults, options, mcpClients, state);
    }

    private createAssistantMessageId(
        prjdb: PrjDB,
        ctx: IRunnerContext,
        persist: boolean,
    ): string {
        if (!persist) {
            return randomUUID();
        }
        return prjdb.saveMessage({
            sessionId: ctx.sessId,
            role: "assistant",
            content: "",
        });
    }

    private inputsFromCtx(ctx: IRunnerContext): Record<string, unknown> {
        const args = ctx.cmd?.args;
        if (!args || typeof args !== "object" || Array.isArray(args)) {
            return {};
        }
        return { ...(args as Record<string, unknown>) };
    }
}