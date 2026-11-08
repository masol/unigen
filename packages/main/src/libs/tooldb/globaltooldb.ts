// packages/main/src/libs/tooldb/globaltooldb.ts
import { getGlobalSearchDB } from "$libs/searchsrv/index.js";
import { throwPrecondition } from "$libs/utils/err.js";
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import { buildAiTool } from "./builder.js";
import {
    closeMcpClient,
    connectMcpServer,
    type McpClient,
} from "./mcp/client.js";
import { builtinId, makeId } from "./naming.js";
import { ToolRegistry, resolveToolDescription } from "./registry.js";
import {
    invokeTool,
    invokeToolDef,
    invokeToolName,
} from "./tools/meta-tools/invoke.js";
import {
    loadSkillToolDef,
    queryAllKnowledgeToolDef,
    queryKnowledgeToolDef,
    searchKnowledgeBasesToolDef,
    searchSkillsToolDef,
} from "./tools/meta-tools/rag.js";
import { isMetaToolId } from "./tools/meta-tools/registry.js";
import {
    searchTool,
    searchToolDef,
    searchToolsToolName,
} from "./tools/meta-tools/search.js";
import type {
    McpServerConfig,
    ToolDefinition,
    ToolMeta,
    ToolSource,
} from "./type.js";

const searchToolMetaId = builtinId(searchToolsToolName);
const invokeToolMetaId = builtinId(invokeToolName);

const META_TOOL_DEFS: ToolDefinition<unknown, unknown>[] = [
    searchToolDef as ToolDefinition<unknown, unknown>,
    invokeToolDef as ToolDefinition<unknown, unknown>,
    searchSkillsToolDef as ToolDefinition<unknown, unknown>,
    loadSkillToolDef as ToolDefinition<unknown, unknown>,
    searchKnowledgeBasesToolDef as ToolDefinition<unknown, unknown>,
    queryKnowledgeToolDef as ToolDefinition<unknown, unknown>,
    queryAllKnowledgeToolDef as ToolDefinition<unknown, unknown>,
];

export interface InitOptions {
    /** 启动期一次性注入的代码工具，source = "builtin" */
    builtins?: ToolDefinition<unknown, unknown>[];
    /** MCP 服务器全量配置（等价于启动后再调用 setMcpServers） */
    mcpServers?: McpServerConfig[];
}

/**
 * 全局工具库（应用级单例，纯内存）。
 *
 * 分层：
 *   GlobalToolDB (Facade: 生命周期 + 串行化 + 对外 API)
 *   ├── ToolRegistry (单一事实源 + llmName 分配)
 *   └── MCP adapter  (远端连接 + Tool 适配)
 *
 * 标识三件套：
 *   - id:      stable 全局标识（builtin::name / mcp::serverId::name）
 *   - name:    原始工具名（自然语言，给 LLM 看）
 *   - llmName: sanitize(name) 后的合法 ToolSet key
 *
 * 检索：
 *   内部不再维护 Fuse/rerank。searchTools 委托 searchsrv 的 tool 表检索，
 *   再按 id 回到当前 registry 取 live ToolMeta。
 *
 * 元工具：
 *   - search_tools / invoke_tool / search_skills / load_skill /
 *     search_knowledge_bases / query_knowledge / query_all_knowledge
 *     由 getBuiltinTools() 注入；
 *   - 若调用方直接 init() 未提供 builtins，init 会兜底注册全部 meta 工具；
 *   - 所有 meta 工具都不进入 searchsrv 的 tool 检索表。
 */
export class GlobalToolDB {
    #registry = new ToolRegistry();
    #mcpClients = new Map<string, McpClient>();
    #mcpConfigs = new Map<string, string>(); // id -> cfg json（无变化短路）
    #opened = false;
    #readyResolve!: () => void;
    #ready = new Promise<void>((r) => {
        this.#readyResolve = r;
    });

    // 串行化队列，统一保护 registry/mcp 状态
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
     * 初始化：加载 builtins → 兜底注册元工具 → 对齐 MCP。
     * 可重入：第二次及以后调用直接返回。
     */
    async init(options: InitOptions = {}): Promise<{ mcpFailed: string[] }> {
        return this.#enqueue(async () => {
            if (this.#opened) return { mcpFailed: [] };

            for (const def of options.builtins ?? []) {
                this.#registerCodeTool(def);
            }
            this.#ensureMetaTools();

            this.#opened = true;

            let mcpFailed: string[] = [];
            if (options.mcpServers?.length) {
                mcpFailed = (
                    await this.#setMcpServersInner(options.mcpServers)
                ).failed;
            }

            Logger.debug(
                `[ToolDB] 全局工具库已就绪，共 ${this.#registry.size} 个工具。`,
            );
            this.#readyResolve();
            return { mcpFailed };
        });
    }

    async close(): Promise<void> {
        return this.#enqueue(async () => {
            for (const [id, client] of this.#mcpClients) {
                await closeMcpClient(id, client);
            }
            this.#mcpClients.clear();
            this.#mcpConfigs.clear();
            this.#registry.clear();
            this.#opened = false;
            this.#ready = new Promise<void>((r) => {
                this.#readyResolve = r;
            });
            Logger.log("[ToolDB] 全局工具库已关闭。");
        });
    }

    /**
     * 等待 init 完成，且此刻已排队的变更（MCP upsert/remove 等）全部落定。
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

    // ---------- MCP 维护 ----------

    async upsertMcpServer(cfg: McpServerConfig): Promise<void> {
        return this.#enqueue(() => this.#applyMcpUpsert(cfg));
    }

    async rmMcpServer(serverId: string): Promise<void> {
        return this.#enqueue(() => this.#applyMcpRemove(serverId));
    }

    async setMcpServers(
        servers: McpServerConfig[],
    ): Promise<{ failed: string[] }> {
        return this.#enqueue(() => this.#setMcpServersInner(servers));
    }

    async #setMcpServersInner(
        servers: McpServerConfig[],
    ): Promise<{ failed: string[] }> {
        const desired = new Set(servers.map((s) => s.id));

        const stale = new Set<string>();
        for (const id of this.#mcpClients.keys()) {
            if (!desired.has(id)) stale.add(id);
        }
        for (const m of this.#registry.list("mcp")) {
            if (m.serverId && !desired.has(m.serverId)) stale.add(m.serverId);
        }
        for (const id of stale) await this.#applyMcpRemove(id);

        const failed: string[] = [];
        for (const cfg of servers) {
            try {
                await this.#applyMcpUpsert(cfg);
            } catch (e) {
                failed.push(cfg.id);
                Logger.error(
                    `[ToolDB] MCP [${cfg.id}] 连接失败，已跳过:`,
                    e,
                );
            }
        }
        Logger.debug(
            `[ToolDB] MCP 全量对齐完成，工具总数 ${this.#registry.size}，失败 ${failed.length}。`,
        );
        return { failed };
    }

    async #applyMcpUpsert(cfg: McpServerConfig): Promise<void> {
        const cfgJson = JSON.stringify(cfg);
        const unchanged = this.#mcpConfigs.get(cfg.id) === cfgJson;
        // 配置未变化且已连接（或已显式 disable）→ 幂等短路
        if (
            unchanged &&
            (cfg.enabled === false || this.#mcpClients.has(cfg.id))
        ) {
            return;
        }

        await this.#applyMcpRemove(cfg.id);
        this.#mcpConfigs.set(cfg.id, cfgJson);
        if (cfg.enabled === false) return;

        const { client, tools } = await connectMcpServer(cfg); // 失败抛出，无残留
        this.#mcpClients.set(cfg.id, client);
        for (const [name, t] of Object.entries(tools)) {
            this.#registry.add({
                id: makeId("mcp", name, cfg.id),
                name,
                description: resolveToolDescription(t),
                source: "mcp",
                serverId: cfg.id,
                tool: t,
                // MCP 工具 schema 原生为 JSON Schema，未反向转 zod；调用全部走 meta.tool
            });
        }
    }

    async #applyMcpRemove(serverId: string): Promise<void> {
        const client = this.#mcpClients.get(serverId);
        if (client) {
            await closeMcpClient(serverId, client);
            this.#mcpClients.delete(serverId);
        }
        this.#mcpConfigs.delete(serverId);
        this.#registry.removeBySource(
            "mcp",
            (m: ToolMeta) => m.serverId === serverId,
        );
    }

    // ---------- 内部：注册代码类工具 ----------

    #ensureMetaTools(): void {
        for (const def of META_TOOL_DEFS) {
            const id = builtinId(def.name);
            if (!this.getToolMeta(id)) {
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
        return this.getToolMeta(searchToolMetaId)?.tool ?? searchTool;
    }

    /** 元工具：执行 search_tools 返回的具体工具 */
    get invokeToolTool(): Tool {
        return this.getToolMeta(invokeToolMetaId)?.tool ?? invokeTool;
    }

    /**
     * 自然语言检索工具。
     *
     * 检索实现已移至 searchsrv：
     *   1. searchsrv 的 tool 表做 hybrid 检索（必要时内部 rerank）；
     *   2. 按返回 id 回到 registry 取 live ToolMeta；
     *   3. 通过 isMetaToolId 过滤所有 meta 工具，并按 source 二次过滤。
     *
     * query 为空时保留旧语义抛错；检索库未就绪或检索失败返回空数组。
     */
    async searchTools(
        query: string,
        opts: { limit?: number; source?: ToolSource } = {},
    ): Promise<ToolMeta[]> {
        const q = (query ?? "").trim();
        if (!q) throwPrecondition("searchTools: query 不能为空");

        const limit = opts.limit ?? 8;
        const db = getGlobalSearchDB();

        if (!db.opened) {
            Logger.warn(
                "[ToolDB] 检索库未打开，searchTools 返回空结果。",
            );
            return [];
        }

        try {
            const rows = await db.tool.searchTools(q, {
                limit: opts.source ? Math.max(limit, limit * 3) : limit,
            });

            const metas: ToolMeta[] = [];
            for (const row of rows) {
                const meta = this.getToolMeta(String(row.id));
                if (!meta || isMetaToolId(meta.id)) {
                    continue;
                }
                if (opts.source && meta.source !== opts.source) continue;
                metas.push(meta);
                if (metas.length >= limit) break;
            }
            return metas;
        } catch (error) {
            Logger.warn(
                "[ToolDB] searchTools 检索失败，返回空结果。",
                error,
            );
            return [];
        }
    }

    /**
     * 按 id（优先）/ llmName / 原始 name 取回完整元数据，
     * 包含预物化的 `tool` 字段，直接可用于 AI SDK。
     */
    getToolMeta(idOrName: string): ToolMeta | null {
        return this.#registry.get(idOrName);
    }

    /**
     * 把检索结果或 id/meta 列表转为可直接挂给 LLM 的 ToolSet。
     * key 使用 llmName，保证唯一且合法；失效的 id 静默跳过。
     */
    toToolSet(
        items: Array<string | ToolMeta>,
        opts: { includeSearchTool?: boolean } = {},
    ): Record<string, Tool> {
        const set: Record<string, Tool> = {};
        if (opts.includeSearchTool) {
            const meta = this.getToolMeta(searchToolMetaId);
            if (meta) set[meta.llmName] = meta.tool;
        }
        for (const item of items) {
            const meta =
                typeof item === "string" ? this.getToolMeta(item) : item;
            if (!meta) continue;
            set[meta.llmName] = meta.tool;
        }
        return set;
    }

    /** 列出全部已注册工具的元信息（含 tool/execute/schema 实例） */
    listTools(source?: ToolSource): ToolMeta[] {
        return this.#registry.list(source);
    }
}

const KEY = Symbol.for("unigen.singleton.globalToolDB");

/**
 * 应用级单例。Electron 主进程模块图唯一，模块级实例即天然单例。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const globalToolDB: GlobalToolDB = ((globalThis as any)[KEY] ??=
    new GlobalToolDB());