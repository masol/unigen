// packages/main/src/libs/tooldb/tools/memory/data.ts
//
// 对当前项目结构化记录的读写工具：session / message / metag / capa。
// 一个工具、一个 op + kind 组合入口，避免为每种记录再引入一组工具。

import { metagFromJson, MetagJson } from "$libs/blueprint/metag/is.js";
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { throwUnprocessable } from "$libs/utils/err.js";
import type { NewCapability } from "$types/blueprint/capability.js";
import type { NewChatMessage } from "$types/shared/chat.js";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";

const chatRoleSchema = z.enum(["user", "assistant"]); // , "system", "tool"

const inputSchema = z
    .object({
        op: z
            .enum(["get", "list", "set", "delete"])
            .describe(
                "操作类型：get 读取单条；list 列出；set 写入/更新（幂等 upsert）；delete 删除。",
            ),
        kind: z
            .enum(["session", "message", "metag", "capa"])
            .describe(
                "数据类型：session=会话；message=消息；metag=元术语；capa=能力。",
            ),
        id: z
            .string()
            .min(1)
            .optional()
            .describe(
                "记录 ID。get/set/delete 时按 kind 必填：" +
                "session/message/capa 用其主键 id；metag 用 fieldKey。",
            ),
        data: z
            .record(z.string(), z.unknown())
            .optional()
            .describe(
                "set 时写入的字段对象。字段结构随 kind 不同：" +
                "session → { title?, extra? }；" +
                "message → { sessionId, role, content, isError?, mode?, files?, extra? }；" +
                "metag → metag 行字段（含 fieldKey 时以 id 为准）；" +
                "capa → { name, code?, ... }（代码能力建议用 create_code_cap 创建）。",
            ),
        sessionId: z
            .string()
            .min(1)
            .optional()
            .describe("list message 时必填：目标会话 ID。"),
        limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .optional()
            .describe("list 时返回条数上限，默认 50。"),
    })
    .superRefine((v, ctx) => {
        if (v.op === "list") {
            if (v.kind === "message" && !v.sessionId) {
                ctx.addIssue({
                    code: "custom",
                    path: ["sessionId"],
                    message: "list message 必须提供 sessionId。",
                });
            }
            if (v.kind === "metag") {
                ctx.addIssue({
                    code: "custom",
                    path: ["kind"],
                    message: "metag 不支持 list；已知 fieldKey 时请直接 get。",
                });
            }
            return;
        }
        if (!v.id) {
            ctx.addIssue({
                code: "custom",
                path: ["id"],
                message: `${v.op} 必须提供 id。`,
            });
        }
        if (v.op === "set" && !v.data) {
            ctx.addIssue({
                code: "custom",
                path: ["data"],
                message: "set 必须提供 data。",
            });
        }
    });

export type DataStoreInput = z.infer<typeof inputSchema>;

export interface DataStoreOutput {
    kind: string;
    op: string;
    data: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

export const dataStoreTool: ToolDefinition<DataStoreInput, DataStoreOutput> = {
    name: "data_store",
    description:
        "读写当前项目的结构化记录：session（会话）、message（消息）、metag（元术语）、capa（能力）。\n" +
        "用 op 选择动作、用 kind 选择表：\n" +
        "- session：get(id) / list(limit) / set({title?, extra?}) 有 id 更新、无 id 新建 / delete(id)\n" +
        "- message：get(id) 含 traces / list(sessionId, limit) / set({sessionId, role, content, ...}) / delete(id)\n" +
        "- metag：get(fieldKey) / set(fieldKey, {...fields}) / delete(fieldKey)（不支持 list）\n" +
        "- capa：get(id) / list(limit) / set(id?, {name, code?, ...}) / delete(id)\n" +
        "使用建议：代码能力请优先用 create_code_cap 创建；capa 仅做元数据/非代码更新时可直接 set；" +
        "纯键值数据用 kv_store。get 未命中返回 data=null。",
    inputSchema,
    execute: async (input) => {
        const ctx = getRunnerContext();
        const db = PrjDB.ensure(ctx.prj);
        const limit = input.limit ?? 50;

        switch (input.kind) {
            case "session": {
                switch (input.op) {
                    case "get":
                        return {
                            kind: input.kind,
                            op: input.op,
                            data: db.getSession(input.id!),
                        };
                    case "list": {
                        const items = db.listSessions({ pageSize: limit });
                        return { kind: input.kind, op: input.op, data: items };
                    }
                    case "set": {
                        const d = asRecord(input.data);
                        if (input.id) {
                            if (typeof d.title === "string") {
                                db.updateSessionTitle(input.id, d.title, true);
                            }
                            if (d.extra && typeof d.extra === "object") {
                                db.updateSessionExtra(
                                    input.id,
                                    d.extra as Record<string, unknown>,
                                );
                            }
                            return {
                                kind: input.kind,
                                op: input.op,
                                data: db.getSession(input.id),
                            };
                        }
                        const newId = db.createSession({
                            ...(typeof d.title === "string"
                                ? { title: d.title }
                                : {}),
                            ...(d.extra && typeof d.extra === "object"
                                ? { extra: d.extra as Record<string, unknown> }
                                : {}),
                        });
                        return {
                            kind: input.kind,
                            op: input.op,
                            data: db.getSession(newId),
                        };
                    }
                    case "delete":
                        db.deleteSession(input.id!);
                        return {
                            kind: input.kind,
                            op: input.op,
                            data: { id: input.id, deleted: true },
                        };
                }
                break;
            }
            case "message": {
                switch (input.op) {
                    case "get":
                        return {
                            kind: input.kind,
                            op: input.op,
                            data: db.getMessage(input.id!, { withTraces: true }),
                        };
                    case "list": {
                        const items = db.listMessages({
                            sessionId: input.sessionId!,
                            withTraces: false,
                            limit,
                        });
                        return { kind: input.kind, op: input.op, data: items };
                    }
                    case "set": {
                        const d = asRecord(input.data);
                        const sessionId =
                            typeof d.sessionId === "string"
                                ? d.sessionId
                                : input.sessionId;
                        if (!sessionId) {
                            throw new Error(
                                "set message 必须提供 sessionId（data.sessionId 或顶层 sessionId）。",
                            );
                        }
                        const role = chatRoleSchema.parse(d.role);
                        const msg: NewChatMessage = {
                            ...(input.id ? { id: input.id } : {}),
                            sessionId,
                            role,
                            content:
                                typeof d.content === "string" ? d.content : "",
                            ...(typeof d.isError === "boolean"
                                ? { isError: d.isError }
                                : {}),
                            ...(Array.isArray(d.files)
                                ? {
                                    files: d.files as NonNullable<
                                        NewChatMessage["files"]
                                    >,
                                }
                                : {}),
                            ...(d.mode === "cmd"
                                ? { mode: d.mode }
                                : {}),
                            ...(d.extra && typeof d.extra === "object"
                                ? { extra: d.extra as Record<string, unknown> }
                                : {}),
                        };
                        const savedId = db.saveMessage(msg);
                        return {
                            kind: input.kind,
                            op: input.op,
                            data: db.getMessage(savedId, { withTraces: true }),
                        };
                    }
                    case "delete":
                        db.deleteMessage(input.id!);
                        return {
                            kind: input.kind,
                            op: input.op,
                            data: { id: input.id, deleted: true },
                        };
                }
                break;
            }
            case "metag": {
                switch (input.op) {
                    case "get": {
                        const [row] = db.getMetag(input.id!);
                        return { kind: input.kind, op: input.op, data: row };
                    }
                    case "set": {
                        if (!input.id) {
                            throwUnprocessable("未给出filedKey")
                        }
                        const d = asRecord(input.data);
                        const metag = metagFromJson({
                            ...d,
                            fieldKey: input.id,
                        } as MetagJson);
                        db.upcertMetag({ ...metag, fieldKey: input.id! });
                        const [row] = db.getMetag(input.id!);
                        return { kind: input.kind, op: input.op, data: row };
                    }
                    case "delete":
                        db.rmMetag(input.id!);
                        return {
                            kind: input.kind,
                            op: input.op,
                            data: { id: input.id, deleted: true },
                        };
                    default:
                        throw new Error("metag 不支持该 op。");
                }
            }
            case "capa": {
                switch (input.op) {
                    case "get":
                        return {
                            kind: input.kind,
                            op: input.op,
                            data: db.getCapaById(input.id!),
                        };
                    case "list": {
                        const res = db.list({
                            kind: "capa",
                            pageIndex: 0,
                            pageSize: limit,
                        });
                        return { kind: input.kind, op: input.op, data: res };
                    }
                    case "set": {
                        const d = asRecord(input.data);
                        const capaId = db.upcertCapa({
                            ...(d as unknown as NewCapability),
                            id: input.id ?? crypto.randomUUID(),
                        });
                        return {
                            kind: input.kind,
                            op: input.op,
                            data: db.getCapaById(capaId),
                        };
                    }
                    case "delete":
                        db.rmCapaById(input.id!);
                        return {
                            kind: input.kind,
                            op: input.op,
                            data: { id: input.id, deleted: true },
                        };
                }
                break;
            }
        }

        throw new Error(
            `不支持的 kind/op 组合: ${String(input.kind)}/${String(input.op)}`,
        );
    },
};