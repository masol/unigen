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

export type McpTransport = z.infer<typeof mcpTransportSchema>;
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;