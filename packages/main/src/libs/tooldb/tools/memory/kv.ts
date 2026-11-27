// packages/main/src/libs/tooldb/tools/memory/kv.ts
//
// 对当前项目 KV store 的读写工具。
// 只做「键值」层面的操作；结构化记录（session/message/metag/capa）走 data_store，
// 文件内容走 fs 系列工具。

import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";

const inputSchema = z.discriminatedUnion("op", [
    z.object({
        op: z.literal("get"),
        key: z.string().min(1).describe("要读取的键。"),
    }),
    z.object({
        op: z.literal("set"),
        key: z.string().min(1).describe("要写入的键。"),
        value: z
            .unknown()
            .describe("要写入的值。任意可 JSON 序列化的数据。"),
    }),
    z.object({
        op: z.literal("remove"),
        key: z.string().min(1).describe("要删除的键。"),
    }),
    z.object({
        op: z.literal("list"),
        pattern: z
            .string()
            .min(1)
            .describe(
                "GLOB 模式，例如 `glossary:*`、`cache:*`。只返回 key，不返回值。",
            ),
    }),
]);

export type KvStoreInput = z.infer<typeof inputSchema>;

export interface KvStoreOutput {
    op: string;
    key?: string;
    found?: boolean;
    value?: unknown;
    updatedAt?: string | null;
    removed?: boolean;
    keys?: string[];
}

export const kvStoreTool: ToolDefinition<KvStoreInput, KvStoreOutput> = {
    name: "kv_store",
    description:
        "读写当前项目的键值库（KV store）。KV 用于存放小型、项目级、持久化的数据：" +
        "术语表、计数器、feature flag、缓存中间态等。\n" +
        "op 说明：\n" +
        "- get：读取单个 key，返回 { value, found, updatedAt }；\n" +
        "- set：写入单个 key，value 可为任意 JSON；\n" +
        "- remove：删除单个 key；\n" +
        "- list：按 GLOB 模式列出 key（只返回 key）。\n" +
        "选择建议：KV 适合小结构化数据；文件内容请用 read_file / write_file；" +
        "session/message/metag/capa 请用 data_store。",
    inputSchema,
    execute: async (input) => {
        const ctx = getRunnerContext();
        const db = PrjDB.ensure(ctx.prj);

        switch (input.op) {
            case "get": {
                const row = db.getWithTime<unknown>(input.key);
                return {
                    op: input.op,
                    key: input.key,
                    found: row !== null,
                    value: row?.value ?? null,
                    updatedAt: row?.updatedAt ?? null,
                };
            }
            case "set": {
                db.set(input.key, input.value);
                return { op: input.op, key: input.key };
            }
            case "remove": {
                db.remove(input.key);
                return { op: input.op, key: input.key, removed: true };
            }
            case "list": {
                const keys = db.getByGlob(input.pattern);
                return { op: input.op, keys };
            }
        }
    },  
};