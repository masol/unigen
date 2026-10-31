import { throwPrecondition } from "$libs/utils/err.js";
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import { buildAiTool } from "./builder.js";
import { loadToolsFromDir } from "./dirloader.js";
import { closeMcpClient, connectMcpServer, type McpClient } from "./mcp.js";
import { builtinId, directoryId, makeId } from "./naming.js";
import { ToolRegistry, resolveToolDescription } from "./registry.js";
import { defaultReranker } from "./rerank.js";
import { searchTool, searchToolsToolName } from "./searchtool.js";
import type {
    McpServerConfig,
    Reranker,
    ToolBrief,
    ToolDefinition,
    ToolMeta,
    ToolSearchResult,
    ToolSource,
} from "./type.js";

const searchToolMetaId = builtinId(searchToolsToolName);

export interface InitOptions {
    /** 启动期一次性注入的代码工具,source = "builtin" */
    builtins?: ToolDefinition<unknown, unknown>[];
    /** 启动期扫描加载的目录,产出 source = "directory" 的工具;实现见 dirloader.ts */
    toolDirs?: string[];
    /** MCP 服务器全量配置(等价于启动后再调用 setMcpServers) */
    mcpServers?: McpServerConfig[];
}

/**
 * 全局工具库(应用级单例,纯内存)。
 *
 * 分层:
 *   GlobalToolDB (Facade:生命周期 + 串行化 + 对外 API)
 *   ├── ToolRegistry (单一事实源 + Fuse 模糊检索)
 *   └── MCP adapter  (远端连接 + Tool 适配)
 *
 * 三种工具来源:
 *   - builtin:   `init({ builtins })` 或运行期 `register()`
 *   - directory: `init({ toolDirs })` 加载的工具
 *   - mcp:       `init({ mcpServers })` / `upsertMcpServer()` / `setMcpServers()`
 *
 * 使用:
 *   await globalToolDB.init({ builtins, toolDirs, mcpServers });
 *   await globalToolDB.register({ ... });                 // 运行期代码工具
 *   const hits = await globalToolDB.searchTools("抓网页转 markdown");
 *   const meta = globalToolDB.getToolMeta(hits[0].id);    // 含预物化 tool
 *   await streamText({ tools: globalToolDB.toToolSet([meta!]) });
 */
export class GlobalToolDB {
    #registry = new ToolRegistry();
    #mcpClients = new Map<string, McpClient>();
    #mcpConfigs = new Map<string, string>();   // id -> cfg json(无变化短路)
    #opened = false;

    /** 重排序钩子,默认直通截断;后续接入 rerank 模型时整体替换 */
    reranker: Reranker = defaultReranker;

    // 串行化队列,统一保护 registry/mcp 状态
    #chain: Promise<unknown> = Promise.resolve();
    #enqueue<T>(job: () => Promise<T>): Promise<T> {
        const p = this.#chain.then(job, job);
        this.#chain = p.then(() => undefined, () => undefined);
        return p;
    }

    get opened(): boolean { return this.#opened; }

    // ---------- 初始化 ----------

    /**
     * 初始化:注入 search_tools 元工具 → 加载 builtins/目录 → 对齐 MCP。
     * 可重入:第二次及以后调用直接返回。
     */
    async init(options: InitOptions = {}): Promise<{ mcpFailed: string[] }> {
        return this.#enqueue(async () => {
            if (this.#opened) return { mcpFailed: [] };

            this.#installSearchTool();

            for (const def of options.builtins ?? []) {
                this.#registerCodeTool("builtin", def);
            }

            for (const dir of options.toolDirs ?? []) {
                try {
                    const defs = await loadToolsFromDir(dir);
                    for (const def of defs) this.#registerCodeTool("directory", def);
                } catch (e) {
                    Logger.error(`[ToolDB] 加载目录失败 ${dir}:`, e);
                }
            }

            this.#opened = true;

            let mcpFailed: string[] = [];
            if (options.mcpServers?.length) {
                mcpFailed = (await this.#setMcpServersInner(options.mcpServers)).failed;
            }

            Logger.debug(`[ToolDB] 全局工具库已就绪,共 ${this.#registry.size} 个工具。`);
            return { mcpFailed };
        });
    }

    async close(): Promise<void> {
        return this.#enqueue(async () => {
            for (const [id, client] of this.#mcpClients) await closeMcpClient(id, client);
            this.#mcpClients.clear();
            this.#mcpConfigs.clear();
            this.#registry.clear();
            this.#opened = false;
            Logger.log("[ToolDB] 全局工具库已关闭。");
        });
    }

    // ---------- 注册面 ----------

    /**
     * 注册任意函数为工具(纯内存,source = "builtin")。
     * 同名重复注册等价于覆盖旧实现。
     *
     * 返回带 llmName/tool 等派生字段的强类型 ToolMeta,可直接传给 AI SDK。
     */
    async register<TInput, TOutput>(
        def: ToolDefinition<TInput, TOutput>,
    ): Promise<ToolMeta<TInput, TOutput>> {
        return this.#enqueue(async () => {
            return this.#registerCodeTool("builtin", def) as ToolMeta<TInput, TOutput>;
        });
    }

    /**
     * 注销一个 builtin 或 directory 工具。
     * MCP 工具由 server 生命周期管理,不受此方法影响。
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

    async setMcpServers(servers: McpServerConfig[]): Promise<{ failed: string[] }> {
        return this.#enqueue(() => this.#setMcpServersInner(servers));
    }

    async #setMcpServersInner(servers: McpServerConfig[]): Promise<{ failed: string[] }> {
        const desired = new Set(servers.map((s) => s.id));

        const stale = new Set<string>();
        for (const id of this.#mcpClients.keys()) if (!desired.has(id)) stale.add(id);
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
                Logger.error(`[ToolDB] MCP [${cfg.id}] 连接失败,已跳过:`, e);
            }
        }
        Logger.debug(`[ToolDB] MCP 全量对齐完成,工具总数 ${this.#registry.size},失败 ${failed.length}。`);
        return { failed };
    }

    async #applyMcpUpsert(cfg: McpServerConfig): Promise<void> {
        const cfgJson = JSON.stringify(cfg);
        const unchanged = this.#mcpConfigs.get(cfg.id) === cfgJson;
        // 配置未变化且已连接(或已显式 disable)→ 幂等短路
        if (unchanged && (cfg.enabled === false || this.#mcpClients.has(cfg.id))) return;

        await this.#applyMcpRemove(cfg.id);
        this.#mcpConfigs.set(cfg.id, cfgJson);
        if (cfg.enabled === false) return;

        const { client, tools } = await connectMcpServer(cfg); // 失败抛出,无残留
        this.#mcpClients.set(cfg.id, client);
        for (const [name, t] of Object.entries(tools)) {
            this.#registry.add({
                id: makeId("mcp", name, cfg.id),
                name,
                description: resolveToolDescription(t),
                source: "mcp",
                serverId: cfg.id,
                tool: t,
                // MCP 工具 schema 原生为 JSON Schema,未反向转 zod;调用全部走 meta.tool
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
        this.#registry.removeBySource("mcp", (m: ToolMeta) => m.serverId === serverId);
    }

    // ---------- 内部:注册代码类工具 ----------

    #installSearchTool(): void {
        this.#registry.add({
            id: searchToolMetaId,
            name: searchToolsToolName,
            llmName: searchToolsToolName,
            description: "用自然语言检索当前可用的工具",
            source: "builtin",
            tool: searchTool,
        });
    }

    #registerCodeTool<TInput, TOutput>(
        source: Extract<ToolSource, "builtin" | "directory">,
        def: ToolDefinition<TInput, TOutput>,
    ): ToolMeta<TInput, TOutput> {
        const id = source === "builtin" ? builtinId(def.name) : directoryId(def.name);
        const t = buildAiTool(def);
        return this.#registry.add({
            id,
            name: def.name,
            description: def.description,
            source,
            tool: t,
            inputSchema: def.inputSchema,
            outputSchema: def.outputSchema,
            execute: def.execute as (input: unknown) => unknown,
        }) as ToolMeta<TInput, TOutput>;
    }

    // ---------- 查询面 ----------

    /** 元工具,挂到 LLM 可让其自行发现其它工具 */
    get searchToolsTool(): Tool { return searchTool; }

    /**
     * 自然语言检索工具(Fuse 模糊匹配 → rerank → 截断)。
     * query 为空时抛错;元工具自身不作为结果返回。
     */
    async searchTools(
        query: string,
        opts: { limit?: number; source?: ToolSource } = {},
    ): Promise<ToolSearchResult[]> {
        const q = (query ?? "").trim();
        if (!q) throwPrecondition("searchTools: query 不能为空");
        const limit = opts.limit ?? 8;

        // 召回量放大 3 倍,给 rerank 留筛选空间
        const candidates: ToolSearchResult[] = this.#registry
            .fuseSearch(q, limit * 3, opts.source)
            .filter((r: { item: ToolMeta; score: number }) => r.item.id !== searchToolMetaId)
            .map((r: { item: ToolMeta; score: number }) => ({ ...r.item, score: r.score, matchedBy: "fuse" as const }));

        const ranked = await this.reranker(q, candidates, limit);
        return ranked.slice(0, limit);
    }

    /**
     * 按 id(优先)/ llmName / 原始 name 取回完整元数据,
     * 包含预物化的 `tool` 字段,直接可用于 AI SDK。
     */
    getToolMeta(idOrName: string): ToolMeta | null {
        return this.#registry.get(idOrName);
    }

    /**
     * 把检索结果或 id/meta 列表转为可直接挂给 LLM 的 ToolSet。
     * key 使用 llmName,保证唯一且合法;失效的 id 静默跳过。
     */
    toToolSet(
        items: Array<string | ToolMeta>,
        opts: { includeSearchTool?: boolean } = {},
    ): Record<string, Tool> {
        const set: Record<string, Tool> = {};
        if (opts.includeSearchTool) set[searchToolsToolName] = searchTool;
        for (const item of items) {
            const meta = typeof item === "string" ? this.getToolMeta(item) : item;
            if (!meta) continue;
            set[meta.llmName] = meta.tool;
        }
        return set;
    }

    /** 列出全部已注册工具的轻量元信息(不含 tool/execute/schema 实例) */
    listTools(source?: ToolSource): ToolBrief[] {
        return this.#registry.list(source).map((m: ToolMeta) => ({
            id: m.id,
            name: m.name,
            llmName: m.llmName,
            description: m.description,
            source: m.source,
            serverId: m.serverId,
        }));
    }
}

const KEY = Symbol.for("unigen.singleton.globalToolDB");
/**
 * 应用级单例。Electron 主进程模块图唯一,模块级实例即天然单例。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const globalToolDB: GlobalToolDB = ((globalThis as any)[KEY] ??= new GlobalToolDB());