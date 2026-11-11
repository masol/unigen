// packages/main/src/libs/tooldb/globaltooldb.ts
// packages/main/src/libs/tooldb/globaltooldb.ts
import {
    mcpRoute,
    wrapMcpTool,
    type McpToolDescriptor,
} from "$libs/mcp/index.js";
import { getGlobalSearchDB } from "$libs/searchsrv/index.js";
import { throwPrecondition } from "$libs/utils/err.js";
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import { buildAiTool } from "./builder.js";
import { getMetaTools } from "./builtins.js";
import { builtinId, mcpId, sanitizeToolName } from "./naming.js";
import { ToolRegistry } from "./registry.js";
import {
    invokeTool,
    invokeToolName,
} from "./tools/meta-tools/invoke.js";
import { isMetaToolId } from "./tools/meta-tools/registry.js";
import { normalizeToJsonSchema } from "./tools/meta-tools/schema.js";
import {
    searchTool,
    searchToolsToolName,
} from "./tools/meta-tools/search.js";
import type {
    ToolDefinition,
    ToolMeta,
    ToolSource,
} from "./type.js";

const searchToolMetaId = builtinId(searchToolsToolName);
const invokeToolMetaId = builtinId(invokeToolName);

export interface InitOptions {
    /** 启动期一次性注入的代码工具，source = "builtin" */
    builtins?: ToolDefinition<unknown, unknown>[];
}

interface ToolSearchRow {
    id: string;
    name: string;
    description?: string;
    metadata?: unknown;
}

interface ToolSyncRow {
    id: string;
    name: string;
    description: string;
    metadata: {
        llmName: string;
        source: "mcp";
        serverId: string;
        configFingerprint?: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
    };
}

function parseRowMetadata(raw: unknown): Record<string, unknown> {
    if (typeof raw === "string" && raw) {
        try {
            const parsed = JSON.parse(raw) as unknown;
            return parsed && typeof parsed === "object"
                ? (parsed as Record<string, unknown>)
                : {};
        } catch {
            return {};
        }
    }
    return raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};
}

async function normalizeToolSchema(
    tool: Tool,
    key: "inputSchema" | "outputSchema",
): Promise<unknown | undefined> {
    const raw = (tool as unknown as Record<string, unknown>)[key];
    if (!raw) return undefined;
    return (await normalizeToJsonSchema(raw)) ?? undefined;
}

/**
 * 全局工具库（应用级单例）。
 *
 * 职责边界：
 *   - builtin / meta 工具：常驻内存（ToolRegistry），由本模块全权管理；
 *   - MCP 工具：**不在内存**。本模块只被动接收 mcp-sync 写入的元数据
 *     （replaceMcpServerTools / removeMcpServerTools），查询时通过
 *     LanceDB 持久化元数据 + mcpRoute 惰性包装器动态解析。
 *
 * tooldb 不持有 MCP 配置、不连接、不管理 MCP 生命周期；
 * 只在真正调用时通过包装器触发 mcpRoute.callTool。
 *
 * 查询入口统一为 `searchTools`：
 *   - query 非空：searchsrv hybrid 检索（相关度排序）；
 *   - query 为空：列出全部可检索工具（分页）；
 *   - 结果按 id 回表：内存命中 builtin；未命中查 LanceDB 并
 *     使用持久化 schema 构造 MCP 惰性包装器。
 */
export class GlobalToolDB {
    #registry = new ToolRegistry();
    #opened = false;
    #readyResolve!: () => void;
    #ready = new Promise<void>((r) => {
        this.#readyResolve = r;
    });

    // 串行化队列，统一保护 registry 状态
    #chain: Promise<unknown> = Promise.resolve();
    #enqueue<T>(job: () => Promise<T>): Promise<T> {
        const p = this.#chain.then(job, job);
        this.#chain = p.then(
            () => undefined,
            () => undefined,
        );
        return p;
    }

    get opened(): boolean {
        return this.#opened;
    }

    // ---------- 初始化 ----------

    /**
     * 初始化：加载 builtins → 兜底注册元工具。
     *
     * 本方法**不处理 MCP**：MCP 配置、连接、发现均由外部（mcp-sync）
     * 通过 `replaceMcpServerTools` / `removeMcpServerTools` 被动写入。
     */
    async init(options: InitOptions = {}): Promise<void> {
        return this.#enqueue(async () => {
            if (this.#opened) return;

            for (const def of options.builtins ?? []) {
                this.#registerCodeTool(def);
            }
            this.#ensureMetaTools();

            this.#opened = true;
            Logger.debug(
                `[ToolDB] 全局工具库已就绪，共 ${this.#registry.size} 个常驻工具。`,
            );
            this.#readyResolve();
        });
    }

    async close(): Promise<void> {
        return this.#enqueue(async () => {
            this.#registry.clear();
            this.#opened = false;
            this.#ready = new Promise<void>((r) => {
                this.#readyResolve = r;
            });
            Logger.log("[ToolDB] 全局工具库已关闭。");
        });
    }

    /**
     * 等待 init 完成，且此刻已排队的变更（如 MCP 元数据替换）全部落定。
     * 超时返回 false，不抛错。
     */
    async whenReady(timeoutMs = 15_000): Promise<boolean> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<false>((r) => {
            timer = setTimeout(() => r(false), timeoutMs);
        });
        const settled = this.#ready.then(() =>
            this.#enqueue(async () => true as const),
        );
        try {
            return await Promise.race([settled, timeout]);
        } finally {
            clearTimeout(timer);
        }
    }

    // ---------- 注册面 ----------

    /**
     * 注册任意函数为工具（纯内存，source = "builtin"）。
     * 同名重复注册等价于覆盖旧实现。
     */
    async register<TInput, TOutput>(
        def: ToolDefinition<TInput, TOutput>,
    ): Promise<ToolMeta<TInput, TOutput>> {
        return this.#enqueue(async () => {
            return this.#registerCodeTool(def);
        });
    }

    /**
     * 注销一个 builtin 工具。
     * MCP 工具由 server 生命周期管理，不受此方法影响。
     */
    async unregister(nameOrId: string): Promise<boolean> {
        return this.#enqueue(async () => {
            const meta = this.#registry.get(nameOrId);
            if (!meta || meta.source === "mcp") return false;
            return this.#registry.remove(meta.id);
        });
    }

    // ---------- MCP 元数据维护（被动响应 mcp-sync） ----------

    /**
     * 以 descriptors 为准，替换 serverId 下的全部 MCP 工具元数据。
     * 只写 LanceDB / searchsrv tool 表，不写 registry。
     *
     * 增量语义：
     *   - 现存的同 serverId 行按 id diff：目标里有的 upsert，目标里没有的删除；
     *   - 其他 source / serverId 的行完全不受影响。
     *
     * 持久化内容包含：
     *   - configFingerprint：用于启动期跨重启配置变化检测；
     *   - inputSchema / outputSchema：用于检索命中后无需连接即可展示/校验。
     *
     * 调用方：mcp-sync 在 discover 后调用。
     */
    async replaceMcpServerTools(
        serverId: string,
        descriptors: readonly McpToolDescriptor[],
    ): Promise<void> {
        return this.#enqueue(() =>
            this.#replaceMcpServerToolsNow(serverId, descriptors),
        );
    }

    /**
     * 移除 serverId 下的全部 MCP 工具元数据。
     *
     * 调用方：mcp-sync 在配置删除 / 禁用后调用。
     */
    async removeMcpServerTools(serverId: string): Promise<void> {
        return this.#enqueue(() => this.#removeMcpServerToolsNow(serverId));
    }

    /**
     * 列出所有在持久化中**已登记 MCP 工具**的 serverId（去重）。
     *
     * 供 mcp-sync 启动期判断"哪些 server 需要 discover"。
     * 不触发 MCP 连接；只读 LanceDB 的 tool 表。
     */
    async listMcpServerIds(): Promise<string[]> {
        return [...(await this.listMcpServerStates()).keys()];
    }

    /**
     * 列出持久化中每个 MCP server 的配置指纹。
     *
     * 返回值：serverId -> configFingerprint。
     * 旧数据可能缺少指纹，此时值为空字符串，调用方应视为“需要 discover”。
     */
    async listMcpServerStates(): Promise<Map<string, string>> {
        const db = getGlobalSearchDB();
        if (!db.opened) return new Map();

        const rows = (await db.tool.queryAll()) as Array<{
            metadata?: unknown;
        }>;

        const states = new Map<string, string>();
        for (const row of rows) {
            const m = parseRowMetadata(row.metadata);
            if (m.source !== "mcp" || typeof m.serverId !== "string") {
                continue;
            }

            const serverId = m.serverId;
            const fingerprint =
                typeof m.configFingerprint === "string"
                    ? m.configFingerprint
                    : "";
            const existing = states.get(serverId);

            if (existing === undefined || (!existing && fingerprint)) {
                states.set(serverId, fingerprint);
            }
        }
        return states;
    }

    async #replaceMcpServerToolsNow(
        serverId: string,
        descriptors: readonly McpToolDescriptor[],
    ): Promise<void> {
        const db = getGlobalSearchDB();
        if (!db.opened) {
            throwPrecondition(
                "[ToolDB] 检索库未打开，无法替换 MCP 工具元数据。",
            );
        }

        if (descriptors.length === 0) {
            await this.#removeMcpServerToolsNow(serverId);
            return;
        }

        const configFingerprint = descriptors[0]?.configFingerprint;
        const targetRows: ToolSyncRow[] = await Promise.all(
            descriptors.map(async (d) => {
                const inputSchema = await normalizeToolSchema(
                    d.tool,
                    "inputSchema",
                );
                const outputSchema = await normalizeToolSchema(
                    d.tool,
                    "outputSchema",
                );

                return {
                    id: mcpId(serverId, d.name),
                    name: d.name,
                    description: d.description ?? "",
                    metadata: {
                        llmName: sanitizeToolName(`${serverId}_${d.name}`),
                        source: "mcp",
                        serverId,
                        ...(configFingerprint
                            ? { configFingerprint }
                            : {}),
                        ...(inputSchema ? { inputSchema } : {}),
                        ...(outputSchema ? { outputSchema } : {}),
                    },
                };
            }),
        );

        const targetIds = new Set(targetRows.map((r) => r.id));
        const existingIds = await db.tool.listToolIds({ serverId });
        const toDelete = existingIds.filter((id) => !targetIds.has(id));

        // 先 upsert 目标，再删陈旧——中途失败至少有最新数据可用。
        if (targetRows.length > 0) {
            await db.tool.upsertTools(targetRows);
        }
        if (toDelete.length > 0) {
            await db.tool.deleteTools(toDelete);
        }

        Logger.debug(
            `[ToolDB] MCP [${serverId}] 已替换元数据：` +
            `upsert ${targetRows.length}，删除 ${toDelete.length}。`,
        );
    }

    async #removeMcpServerToolsNow(serverId: string): Promise<void> {
        const db = getGlobalSearchDB();
        if (!db.opened) {
            throwPrecondition(
                "[ToolDB] 检索库未打开，无法移除 MCP 工具元数据。",
            );
        }

        const existingIds = await db.tool.listToolIds({ serverId });
        if (existingIds.length > 0) {
            await db.tool.deleteTools(existingIds);
        }

        Logger.debug(
            `[ToolDB] MCP [${serverId}] 已移除 ${existingIds.length} 个工具元数据。`,
        );
    }

    // ---------- 内部：注册代码类工具 ----------

    #ensureMetaTools(): void {
        // 必须调用函数（而非模块级常量数组）：
        // globaltooldb ↔ meta-tools/invoke|search 存在循环依赖，
        // 模块级数组会在 invoke.ts / search.ts 模块体执行前求值，
        // 导致 def 为 undefined。此处运行在 init 异步任务内，所有模块体已完成。
        for (const def of getMetaTools()) {
            const id = builtinId(def.name);
            if (!this.#registry.get(id)) {
                this.#registerCodeTool(def);
            }
        }
    }

    #registerCodeTool<TInput, TOutput>(
        def: ToolDefinition<TInput, TOutput>,
    ): ToolMeta<TInput, TOutput> {
        const id = builtinId(def.name);
        const t = buildAiTool(def);
        return this.#registry.add({
            id,
            name: def.name,
            description: def.description,
            source: "builtin",
            tool: t,
            inputSchema: def.inputSchema,
            outputSchema: def.outputSchema,
            execute: def.execute as (input: unknown) => unknown,
        }) as ToolMeta<TInput, TOutput>;
    }

    // ---------- 查询面 ----------

    /** 元工具，挂到 LLM 可让其自行发现其它工具 */
    get searchToolsTool(): Tool {
        return this.#registry.get(searchToolMetaId)?.tool ?? searchTool;
    }

    /** 元工具：执行 search_tools 返回的具体工具 */
    get invokeToolTool(): Tool {
        return this.#registry.get(invokeToolMetaId)?.tool ?? invokeTool;
    }

    /**
     * 统一的工具查询入口。
     *
     * - query 非空：searchsrv hybrid 检索（相关度排序）；
     * - query 为空字符串：返回**全部可检索工具**（分页）；
     * - 结果按 id 回表：内存命中 builtin；未命中查 LanceDB 并
     *   用持久化 schema 构造 MCP 惰性包装器；
     * - 跳过 meta 工具（isMetaToolId）；按 opts.source 二次过滤。
     *
     * 分页：
     *   - offset / limit 控制；
     *   - 返回结果 `< limit` 表示已到末尾（无下一页）。
     */
    async searchTools(
        query: string,
        opts: {
            limit?: number;
            offset?: number;
            source?: ToolSource;
        } = {},
    ): Promise<ToolMeta[]> {
        const q = (query ?? "").trim();
        const limit = opts.limit ?? 8;
        const offset = opts.offset ?? 0;

        if (limit <= 0) {
            throwPrecondition("searchTools: limit 必须大于 0");
        }
        if (offset < 0) {
            throwPrecondition("searchTools: offset 不能为负");
        }

        const db = getGlobalSearchDB();
        if (!db.opened) {
            Logger.warn(
                "[ToolDB] 检索库未打开，searchTools 返回空结果。",
            );
            return [];
        }

        const target = offset + limit;
        const fetchLimit = opts.source
            ? Math.max(target, target * 3)
            : target;

        try {
            const rows = await db.tool.searchTools(q, {
                limit: fetchLimit,
            });

            const metas: ToolMeta[] = [];
            for (const row of rows) {
                if (metas.length >= target) break;
                const meta = await this.getToolMeta(String(row.id));
                if (!meta || isMetaToolId(meta.id)) continue;
                if (opts.source && meta.source !== opts.source) continue;
                metas.push(meta);
            }
            return metas.slice(offset);
        } catch (error) {
            Logger.warn(
                "[ToolDB] searchTools 检索失败，返回空结果。",
                error,
            );
            return [];
        }
    }

    /**
     * 解析工具元数据。
     *
     * - 先查内存 registry（builtin/meta）；
     * - 未命中查 searchsrv.tool.getById；
     * - 若 source === "mcp"，用持久化 metadata 中的 schema 构造惰性包装器；
     *   不调用 mcpRoute.discoverTools，因此检索命中不会发起 MCP 连接；
     * - 返回临时 ToolMeta，不写回 registry。
     */
    async getToolMeta(idOrName: string): Promise<ToolMeta | null> {
        const local = this.#registry.get(idOrName);
        if (local) return local;

        const db = getGlobalSearchDB();
        if (!db.opened) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const table = db.tool as any;

        if (typeof table.getById !== "function") {
            Logger.warn(
                "[ToolDB] searchsrv tool 表缺少 getById，无法解析 MCP 工具。",
            );
            return null;
        }

        let row: ToolSearchRow | null;
        try {
            row = (await table.getById(idOrName)) ?? null;
        } catch (e) {
            Logger.warn(
                `[ToolDB] 查询工具元数据失败: ${idOrName}`,
                e,
            );
            return null;
        }

        if (!row && typeof table.searchTools === "function") {
            try {
                const candidates = (await table.searchTools(idOrName, {
                    limit: 5,
                })) as ToolSearchRow[];
                row =
                    candidates.find((r) => {
                        if (String(r.id) === idOrName) return true;
                        if (String(r.name) === idOrName) return true;
                        const m = parseRowMetadata(r.metadata);
                        return String(m.llmName ?? "") === idOrName;
                    }) ?? null;
            } catch (e) {
                Logger.warn(
                    `[ToolDB] 回退检索工具元数据失败: ${idOrName}`,
                    e,
                );
            }
        }

        if (!row) return null;

        const metadata = parseRowMetadata(row.metadata);
        if (metadata.source !== "mcp") return null;

        const serverId =
            typeof metadata.serverId === "string"
                ? metadata.serverId
                : undefined;
        if (!serverId) {
            Logger.warn(
                `[ToolDB] MCP 工具元数据缺少 serverId: ${String(row.id)}`,
            );
            return null;
        }

        const name = String(row.name);
        const llmName =
            typeof metadata.llmName === "string" && metadata.llmName
                ? metadata.llmName
                : sanitizeToolName(`${serverId}_${name}`);

        const description = String(row.description ?? "");
        const inputSchema = metadata.inputSchema;
        const outputSchema = metadata.outputSchema;

        const raw = {
            description,
            ...(inputSchema
                ? { inputSchema: { jsonSchema: inputSchema } }
                : {}),
            ...(outputSchema
                ? { outputSchema: { jsonSchema: outputSchema } }
                : {}),
        } as unknown as Tool;

        const tool = wrapMcpTool({
            serverId,
            name,
            raw,
            call: (sid, n, args, opts) =>
                mcpRoute.callTool(sid, n, args, opts),
        });

        return {
            id: String(row.id),
            name,
            llmName,
            description,
            source: "mcp",
            serverId,
            tool,
        };
    }

    /**
     * 把检索结果或 meta 列表转为可直接挂给 LLM 的 ToolSet。
     * key 使用 llmName，保证唯一且合法；失效的项静默跳过。
     *
     * 同步方法：传入 string 时只查内存（builtin/meta）。
     * MCP 工具请先 `await getToolMeta(id)` 得到 ToolMeta 再传入。
     */
    toToolSet(
        items: Array<string | ToolMeta>,
        opts: { includeSearchTool?: boolean } = {},
    ): Record<string, Tool> {
        const set: Record<string, Tool> = {};
        if (opts.includeSearchTool) {
            const meta = this.#registry.get(searchToolMetaId);
            if (meta) set[meta.llmName] = meta.tool;
        }
        for (const item of items) {
            const meta =
                typeof item === "string"
                    ? this.#registry.get(item)
                    : item;
            if (!meta) continue;
            set[meta.llmName] = meta.tool;
        }
        return set;
    }

    /**
     * 列出**内存中**的常驻工具（builtin + meta）。
     *
     * - 同步、不查 LanceDB、不触发 MCP 连接；
     * - 仅用于内部枚举（如 syncToolsToSearchDB 首次全量写入 searchsrv）；
     * - **不**包含 MCP 工具；MCP 请使用 `searchTools("")` 分页获取。
     */
    listBuiltinTools(): ToolMeta[] {
        return this.#registry.list();
    }
}

const KEY = Symbol.for("unigen.singleton.globalToolDB");

/**
 * 应用级单例。Electron 主进程模块图唯一，模块级实例即天然单例。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const globalToolDB: GlobalToolDB = ((globalThis as any)[KEY] ??=
    new GlobalToolDB());