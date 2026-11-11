// packages/main/src/libs/mcp/errors.ts

export class McpRouteError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}

export class McpRouteClosedError extends McpRouteError {
    constructor() {
        super("MCP Route 已关闭。");
    }
}

export class McpServerNotConfiguredError extends McpRouteError {
    constructor(serverId: string) {
        super(`MCP server 未配置: ${serverId}`);
    }
}

export class McpServerDisabledError extends McpRouteError {
    constructor(serverId: string) {
        super(`MCP server 已禁用: ${serverId}`);
    }
}

export class McpToolNotFoundError extends McpRouteError {
    constructor(serverId: string, toolName: string) {
        super(`MCP 工具不存在: ${serverId} / ${toolName}`);
    }
}

export class McpToolNotExecutableError extends McpRouteError {
    constructor(serverId: string, toolName: string) {
        super(`MCP 工具不可执行: ${serverId} / ${toolName}`);
    }
}

export class McpLeaseReleasedError extends McpRouteError {
    constructor(serverId: string) {
        super(`MCP 连接租约已释放: ${serverId}`);
    }
}