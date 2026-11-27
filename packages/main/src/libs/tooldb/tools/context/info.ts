// packages/main/src/libs/tooldb/tools/context/info.ts
//
// 统一读取当前执行上下文信息。
//
// 用一个 category 入参替代 getSessionInfo / getMessageInfo / ... 的入口爆炸；
// 只返回指定视角的少量字段，避免把整个 ctx 注入会话上下文。

import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { metaDirName } from "$libs/project/type.js";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";

const inputSchema = z.object({
    category: z
        .enum(["project", "session", "context"])
        .describe(
            "要读取的视角：project=项目根路径/元目录；session=当前会话相关（会话 ID 等）；" +
            "context=ctx 的顶层标量快照。",
        ),
});

export type ContextInfoInput = z.infer<typeof inputSchema>;

export interface ContextInfoOutput {
    category: string;
    info: Record<string, unknown>;
}

function snapshotScalars(
    source: unknown,
    depth: number,
    maxDepth: number,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!source || typeof source !== "object" || depth > maxDepth) return out;

    for (const key of Object.keys(source as object)) {
        if (key.startsWith("_")) continue;
        const value = (source as Record<string, unknown>)[key];
        const t = typeof value;

        if (
            t === "string" ||
            t === "number" ||
            t === "boolean" ||
            value === null
        ) {
            out[key] = value;
        } else if (t === "object" && value && !Array.isArray(value)) {
            out[key] = snapshotScalars(value, depth + 1, maxDepth);
        }
    }
    return out;
}

export const contextInfoTool: ToolDefinition<
    ContextInfoInput,
    ContextInfoOutput
> = {
    name: "context_info",
    description:
        "读取当前执行上下文的只读信息。用 category 选择视角，避免一次性注入过多上下文：\n" +
        "- project：项目根路径（path）、元目录名（metaDir）；\n" +
        "- session：当前会话 ID 等会话信息（用于需要会话 ID 的调用）；\n" +
        "- context：ctx 的顶层标量快照（字符串/数字/布尔与浅层对象）。\n" +
        "如需能力信息请用 data_store(kind=capa)，如需项目文件请用 fs 系列工具。",
    inputSchema,
    execute: async ({ category }) => {
        const ctx = getRunnerContext();

        switch (category) {
            case "project":
                return {
                    category,
                    info: {
                        path: ctx.prj?.path,
                        metaDir: metaDirName,
                    },
                };
            case "session": {
                // 会话信息在 IRunnerContext 上的精确字段名待确认；
                // 这里做防御式读取，兼容 session / sessId / sessionId 多种写法。
                const c = ctx as unknown as Record<string, unknown>;
                const prj = (ctx.prj ?? {}) as unknown as Record<
                    string,
                    unknown
                >;
                const session =
                    c.session ?? prj.session ?? null;
                const sessionId =
                    c.sessionId ??
                    c.sessId ??
                    (session as { id?: string } | null)?.id ??
                    prj.sessionId ??
                    null;
                return {
                    category,
                    info: {
                        sessionId,
                        session: snapshotScalars(session, 0, 1),
                    },
                };
            }
            case "context":
                return {
                    category,
                    info: snapshotScalars(ctx, 0, 1),
                };
        }
    },
};