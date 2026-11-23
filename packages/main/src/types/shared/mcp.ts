import { z } from 'zod';

export const mcpStdioTransportSchema = z
    .object({
        type: z.literal('stdio'),
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
        cwd: z.string().optional(),
    })
    .strict();

export const mcpSseTransportSchema = z
    .object({
        type: z.literal('sse'),
        url: z.string().min(1),
        headers: z.record(z.string(), z.string()).optional(),
    })
    .strict();

export const mcpHttpTransportSchema = z
    .object({
        type: z.literal('http'),
        url: z.string().min(1),
        headers: z.record(z.string(), z.string()).optional(),
    })
    .strict();

export const mcpTransportSchema = z.discriminatedUnion('type', [
    mcpStdioTransportSchema,
    mcpSseTransportSchema,
    mcpHttpTransportSchema,
]);

export const mcpServerConfigSchema = z
    .object({
        id: z.string().min(1),
        name: z.string().optional(),
        enabled: z.boolean().optional(),
        transport: mcpTransportSchema,
    })
    .strict();

/**
 * 测试用配置：id 允许为空 / 缺失，用于客户端“新增前测试”。
 * 其余字段与 mcpServerConfigSchema 保持一致。
 */
export const mcpTestServerConfigSchema = z
    .object({
        ...mcpServerConfigSchema.shape,
        id: z.string().optional(),
    })
    .strict();

export type McpTransport = z.infer<typeof mcpTransportSchema>;
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
export type McpTestServerConfig = z.infer<typeof mcpTestServerConfigSchema>;

export const mcpToolInfoSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
});

export const mcpResourceInfoSchema = z.object({
    uri: z.string(),
    name: z.string().optional(),
});

export const mcpPromptInfoSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
});

/**
 * MCP server 在握手阶段自报的身份信息。
 *
 * 客户端在写入结果前会做一次规整：
 * - name 为空时依次回退到 version、传输协议名（保证非空）；
 * - version 为空时回退为 "unknown"。
 */
export const mcpServerInfoSchema = z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    title: z.string().optional(),
});

export const mcpConnectionTestSuccessSchema = z.object({
    ok: z.literal(true),
    latencyMs: z.number().nonnegative(),
    serverInfo: mcpServerInfoSchema,
    protocolVersion: z.string().optional(),
    tools: z.array(mcpToolInfoSchema),
    resources: z.array(mcpResourceInfoSchema).optional(),
    prompts: z.array(mcpPromptInfoSchema).optional(),
});

export const mcpConnectionTestFailureSchema = z.object({
    ok: z.literal(false),
    latencyMs: z.number().nonnegative(),
    tools: z.array(mcpToolInfoSchema),
    error: z.string().min(1),
});

export const mcpConnectionTestResultSchema = z.discriminatedUnion('ok', [
    mcpConnectionTestSuccessSchema,
    mcpConnectionTestFailureSchema,
]);

export type McpServerInfo = z.infer<typeof mcpServerInfoSchema>;
export type McpConnectionTestSuccess = z.infer<
    typeof mcpConnectionTestSuccessSchema
>;
export type McpConnectionTestFailure = z.infer<
    typeof mcpConnectionTestFailureSchema
>;
export type McpConnectionTestResult = z.infer<
    typeof mcpConnectionTestResultSchema
>;

export type McpToolInfo = z.infer<typeof mcpToolInfoSchema>;
export type McpResourceInfo = z.infer<typeof mcpResourceInfoSchema>;
export type McpPromptInfo = z.infer<typeof mcpPromptInfoSchema>;