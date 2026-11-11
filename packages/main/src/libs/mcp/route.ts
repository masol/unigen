// packages/main/src/libs/mcp/route.ts
import { appLife } from "$libs/utils/tapable/applife.js";
import { McpConnectionPool } from "./connection.js";
import type {
    McpConnectionLease,
    McpServerConfig,
    McpServerToolSnapshot,
    McpToolCallOptions,
    McpToolDescriptor,
    SetServersResult,
} from "./type.js";

export {
    McpLeaseReleasedError,
    McpRouteClosedError,
    McpRouteError,
    McpServerDisabledError,
    McpServerNotConfiguredError,
    McpToolNotExecutableError,
    McpToolNotFoundError
} from "./errors.js";

/**
 * MCP 路由门面。
 *
 * - 配置管理（不连接）：init / setServers / upsertServer / removeServer
 * - 显式发现（连接）：discoverTools
 * - 真实调用（惰性连接）：acquire / callTool
 * - 生命周期：close / listServerTools
 *
 * 与 tooldb 的协作由 `$libs/mcp-sync` 编排，本层不依赖 tooldb。
 *
 * 生命周期：构造时注册 `appLife.beforeQuit`，应用退出时自动 `close()`，
 * 清理所有连接与 idle 计时器。使用 Symbol 标记保证同一实例只注册一次。
 */
const LIFECYCLE_HOOKED = Symbol("unigen.mcpRoute.lifecycleHooked");

export class McpRoute {
    readonly #pool: McpConnectionPool;

    constructor() {
        this.#pool = new McpConnectionPool();

        const self = this as unknown as Record<symbol, boolean>;
        if (!self[LIFECYCLE_HOOKED]) {
            self[LIFECYCLE_HOOKED] = true;
            appLife.beforeQuit.tapPromise("McpRoute", () => this.close());
        }
    }

    init(servers: McpServerConfig[] = []): Promise<SetServersResult> {
        return this.#pool.init(servers);
    }

    setServers(servers: McpServerConfig[]): Promise<SetServersResult> {
        return this.#pool.setServers(servers);
    }

    upsertServer(cfg: McpServerConfig): Promise<{ changed: boolean }> {
        return this.#pool.upsertServer(cfg);
    }

    removeServer(serverId: string): Promise<void> {
        return this.#pool.removeServer(serverId);
    }

    discoverTools(serverId: string): Promise<McpToolDescriptor[]> {
        return this.#pool.discoverTools(serverId);
    }

    acquire(serverId: string): Promise<McpConnectionLease> {
        return this.#pool.acquire(serverId);
    }

    callTool(
        serverId: string,
        toolName: string,
        args: unknown,
        options?: McpToolCallOptions,
    ): Promise<unknown> {
        return this.#pool.callTool(serverId, toolName, args, options);
    }

    listServerTools(): Promise<McpServerToolSnapshot[]> {
        return this.#pool.listServerTools();
    }

    close(): Promise<void> {
        return this.#pool.close();
    }
}

const KEY = Symbol.for("unigen.singleton.mcpRoute");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mcpRoute: McpRoute = ((globalThis as any)[KEY] ??=
    new McpRoute());