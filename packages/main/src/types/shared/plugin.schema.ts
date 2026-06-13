import { z } from 'zod'

// 基础枚举 schema
export const PluginScopeSchema = z.enum(['core', 'system', 'project'])
export const PluginStatusSchema = z.enum(['enabled', 'disabled', 'error'])

// 简单对象 schema
export const ModuleSourceSchema = z.object({
    code: z.string(),
    version: z.string().optional(),
})

// 复杂对象 schema（依赖上面的枚举）
export const PluginInfoSchema = z.object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    description: z.string(),
    scope: PluginScopeSchema,
    installed: z.boolean(),
    installedAt: z.number().nullable(),
    config: z.record(z.string(), z.unknown()),
    statusChangedAt: z.number().nullable(),
    status: PluginStatusSchema,
})