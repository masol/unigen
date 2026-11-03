// packages/main/src/libs/blueprint/capability/local/agent/history.ts

import type { IRunnerContext } from "$types/blueprint/context.js";
import type { ModelMessage } from "ai";
import Logger from "electron-log/main.js";
import {
    appendHistoryMessage,
    loadHistoryMessages,
    SYSTEM_FAILURE_MARKER,
} from "../context/index.js";

export async function loadPriorMessages(
    ctx: IRunnerContext,
    agentId: string,
    historyLimit: number | null,
    histEnabled: boolean,
): Promise<ModelMessage[]> {
    if (!histEnabled) return [];
    return loadHistoryMessages(ctx, agentId, historyLimit);
}

export async function saveConversation(
    ctx: IRunnerContext,
    agentId: string,
    userMessage: ModelMessage,
    finalText: string,
    failure: unknown,
    histEnabled: boolean,
    stepPath: string,
    agentName: string,
): Promise<void> {
    if (!histEnabled) return;

    if (failure !== undefined) {
        Logger.warn(
            `[PAC][step=${stepPath}] ${agentName} 生成失败,写入占位符`,
            failure,
        );
        await appendHistoryMessage(ctx, agentId, userMessage);
        await appendHistoryMessage(ctx, agentId, {
            role: "assistant",
            content: SYSTEM_FAILURE_MARKER,
        });
    } else if (finalText) {
        await appendHistoryMessage(ctx, agentId, userMessage);
        await appendHistoryMessage(ctx, agentId, {
            role: "assistant",
            content: finalText,
        });
    }
}