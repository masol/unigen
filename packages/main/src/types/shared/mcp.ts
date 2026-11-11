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

export const mcpConnectionTestResultSchema = z.object({
    ok: z.boolean(),
    latencyMs: z.number(),
    protocolVersion: z.string().optional(),
    serverInfo: z
        .object({
            name: z.string(),
            version: z.string(),
        })
        .optional(),
    tools: z.array(mcpToolInfoSchema),
    resources: z.array(mcpResourceInfoSchema).optional(),
    prompts: z.array(mcpPromptInfoSchema).optional(),
    error: z.string().optional(),
});

export type McpToolInfo = z.infer<typeof mcpToolInfoSchema>;
export type McpResourceInfo = z.infer<typeof mcpResourceInfoSchema>;
export type McpPromptInfo = z.infer<typeof mcpPromptInfoSchema>;
export type McpConnectionTestResult = z.infer<
    typeof mcpConnectionTestResultSchema
>;