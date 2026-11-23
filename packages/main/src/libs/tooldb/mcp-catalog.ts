// packages/main/src/libs/tooldb/mcp-catalog.ts
import { mcpRoute, wrapMcpTool } from "$libs/mcp/index.js";
import type { ToolRow, ToolTable } from "$libs/searchsrv/index.js";
import { jsonSchema, type Tool } from "ai";
import Logger from "electron-log/main.js";
import { sanitizeToolName } from "./naming.js";
import type { ToolMeta } from "./type.js";

/**
 * McpToolCatalog 与 GlobalToolDB 的解耦契约。
 *
 * 只注入“如何拿到已打开的 tool 表”，不注入 GlobalToolDB 实例：
 * - 目录类不持有可变状态，可被任意宿主复用（项目级 / 全局级）；
 * - 避免 catalog ↔ globaltooldb 运行期循环依赖（类型依赖是单向的）。
 */
export interface McpToolCatalogHost {
    /** 已打开的 tool 表；检索库未就绪时返回 null。 */
    toolTable(): ToolTable | null;
}

/** 一个 MCP server 的持久化视图，不触发任何连接。 */
export interface McpServerSummary {
    serverId: string;
    /** 启动期配置变化检测用的稳定指纹；旧数据可能为空串。 */
    configFingerprint: string;
    toolCount: number;
}

/** 分页读取 tool 表的页大小；MCP 工具量级很小，200 足够。 */
const PAGE_SIZE = 200;
/** 兜底上限，防止表异常增长时无限翻页。 */
const MAX_PAGES = 50;

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

/**
 * 从持久化行构造 MCP 惰性包装器 ToolMeta；非 MCP 行返回 null。
 *
 * 包装器不持有连接：真实调用时才经 `mcpRoute.callTool` 惰性连接，
 * 因此本函数可以安全地在任何时刻（包括启动期）对任意数量的行调用。
 */
export function buildMcpToolMetaFromRow(
    row: ToolRow,
    metadata: Record<string, unknown>,
): ToolMeta | null {
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

    const rawTool = {
        description,
        ...(inputSchema
            ? { inputSchema: jsonSchema(inputSchema) }
            : {}),
        ...(outputSchema
            ? { outputSchema: jsonSchema(outputSchema) }
            : {}),
    } as unknown as Tool;

    const tool = wrapMcpTool({
        serverId,
        name,
        raw: rawTool,
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
 * MCP 工具目录：只读 LanceDB 中 `source === "mcp"` 的持久化元数据。
 *
 * 职责：
 *   - 枚举 server（`listServers`）与某 server 下的全部工具（`listTools`）；
 *   - 按可引用标识解析工具（`findByReference`），供 `invoke_tool` 使用；
 *   - 提供启动期配置指纹（`serverStates`）。
 *
 * 明确不做：
 *   - 不连接 MCP、不触发 discover、不修改任何数据；
 *   - 不缓存结果：工具量级小，一次分页扫描即可，避免与 `replaceMcpServerTools`
 *     的写入产生缓存一致性问题。
 */
export class McpToolCatalog {
    constructor(private readonly host: McpToolCatalogHost) { }

    #table(): ToolTable | null {
        try {
            return this.host.toolTable();
        } catch (error) {
            Logger.warn("[ToolDB] 获取工具检索表失败。", error);
            return null;
        }
    }

    /**
     * 分页读取全部工具行。
     *
     * 用 `listTools` 而不是 `queryAll`：后者会把 vector 列整列取回，
     * 在工具数量稍多时是无谓的 IO 与内存开销。
     */
    async #allRows(): Promise<ToolRow[]> {
        const table = this.#table();
        if (!table) return [];

        const rows: ToolRow[] = [];
        for (let page = 0; page < MAX_PAGES; page += 1) {
            const chunk = await table.listTools({
                limit: PAGE_SIZE,
                offset: page * PAGE_SIZE,
            });
            rows.push(...chunk);
            if (chunk.length < PAGE_SIZE) return rows;
        }

        Logger.warn(
            `[ToolDB] MCP 工具枚举达到页数上限 ${MAX_PAGES}（每页 ${PAGE_SIZE}），结果可能不完整。`,
        );
        return rows;
    }

    /** 全部 MCP 行，按 id 去重（重复 id 以最后一行为准并告警）。 */
    async #mcpRows(): Promise<
        Array<{ row: ToolRow; metadata: Record<string, unknown> }>
    > {
        const byId = new Map<
            string,
            { row: ToolRow; metadata: Record<string, unknown> }
        >();

        for (const row of await this.#allRows()) {
            const metadata = parseRowMetadata(row.metadata);
            if (metadata.source !== "mcp") continue;

            const id = String(row.id);
            if (byId.has(id)) {
                Logger.warn(
                    `[ToolDB] 工具表出现重复 id: ${id}，以最后一行为准。`,
                );
            }
            byId.set(id, { row, metadata });
        }

        return [...byId.values()];
    }

    /**
     * 列出持久化中登记过的全部 MCP server（按 serverId 稳定排序）。
     *
     * 不判断该 server 当前是否在配置中存在 / 是否可连接——这是“历史登记视图”，
     * 用于 UI 展示或排查；是否需要清理由 mcp-sync 的启动编排负责。
     */
    async listServers(): Promise<McpServerSummary[]> {
        const states = new Map<string, McpServerSummary>();

        for (const { metadata } of await this.#mcpRows()) {
            const serverId =
                typeof metadata.serverId === "string"
                    ? metadata.serverId
                    : "";
            if (!serverId) continue;

            const fingerprint =
                typeof metadata.configFingerprint === "string"
                    ? metadata.configFingerprint
                    : "";

            const entry = states.get(serverId);
            if (!entry) {
                states.set(serverId, {
                    serverId,
                    configFingerprint: fingerprint,
                    toolCount: 1,
                });
                continue;
            }

            entry.toolCount += 1;
            if (!entry.configFingerprint && fingerprint) {
                entry.configFingerprint = fingerprint;
            }
        }

        return [...states.values()].sort((a, b) =>
            a.serverId.localeCompare(b.serverId),
        );
    }

    /**
     * 列出某个 MCP server 下的全部工具。
     *
     * 返回的 `ToolMeta.tool` 是惰性包装器，可直接挂进 ToolSet；
     * 取列表这个动作本身不会建立任何连接。
     */
    async listTools(serverId: string): Promise<ToolMeta[]> {
        const id = serverId.trim();
        if (!id) return [];

        const metas: ToolMeta[] = [];
        for (const { row, metadata } of await this.#mcpRows()) {
            if (metadata.serverId !== id) continue;
            const meta = buildMcpToolMetaFromRow(row, metadata);
            if (meta) metas.push(meta);
        }

        return metas.sort(
            (a, b) =>
                a.name.localeCompare(b.name) ||
                a.id.localeCompare(b.id),
        );
    }

    /** 列出全部 MCP 工具（跨 server），按 serverId + name 稳定排序。 */
    async listAllTools(): Promise<ToolMeta[]> {
        const metas: ToolMeta[] = [];
        for (const { row, metadata } of await this.#mcpRows()) {
            const meta = buildMcpToolMetaFromRow(row, metadata);
            if (meta) metas.push(meta);
        }

        return metas.sort(
            (a, b) =>
                String(a.serverId).localeCompare(String(b.serverId)) ||
                a.name.localeCompare(b.name) ||
                a.id.localeCompare(b.id),
        );
    }

    /**
     * 每个 MCP server 的配置指纹：serverId -> configFingerprint。
     *
     * 供 mcp-sync 启动期判断“停机期间配置是否变化”。
     * 旧数据可能缺少指纹，此时为空串，调用方应视为“需要 discover”。
     */
    async serverStates(): Promise<Map<string, string>> {
        const states = new Map<string, string>();
        for (const summary of await this.listServers()) {
            states.set(summary.serverId, summary.configFingerprint);
        }
        return states;
    }

    /**
     * 按可引用标识解析 MCP 工具，返回全部匹配项（允许重名）。
     *
     * 支持：
     *   - 全局 id：`mcp::<serverId>::<name>`（精确，优先）
     *   - `metadata.llmName`
     *   - 原始工具名（`ToolTable.name`，即协议内部函数名）
     *   - `mcp:<name>` 简写（仅匹配 MCP 工具）
     *
     * 不替调用方裁决歧义。唯一性判断在 `GlobalToolDB.getToolMeta` 中完成，
     * 因为那边还要合并 builtin 的匹配结果。
     *
     * 注意：不再保留“`findByIdentity` 缺失时回退到 FTS / 向量检索”的分支。
     * 该回退会在索引滞后于 `delete` 时把已删除的 MCP 工具重新解析出来。
     */
    async findByReference(idOrName: string): Promise<ToolMeta[]> {
        const raw = idOrName.trim();
        if (!raw) return [];

        const table = this.#table();
        if (!table) return [];

        const rows: ToolRow[] = [];

        try {
            const direct = await table.getById(raw);
            if (direct) rows.push(direct);
        } catch (error) {
            Logger.warn(
                `[ToolDB] 按 id 查询 MCP 工具元数据失败: ${raw}`,
                error,
            );
        }

        if (rows.length === 0) {
            try {
                rows.push(...(await table.findByIdentity(raw)));
            } catch (error) {
                Logger.warn(
                    `[ToolDB] 按 id/name/llmName 查询 MCP 工具元数据失败: ${raw}`,
                    error,
                );
            }
        }

        const metas: ToolMeta[] = [];
        const seen = new Set<string>();
        for (const row of rows) {
            const meta = buildMcpToolMetaFromRow(
                row,
                parseRowMetadata(row.metadata),
            );
            if (!meta || seen.has(meta.id)) continue;
            seen.add(meta.id);
            metas.push(meta);
        }

        return metas;
    }
}