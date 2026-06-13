import { z } from 'zod'
import {
    PluginScopeSchema,
    PluginStatusSchema,
    ModuleSourceSchema,
    PluginInfoSchema
} from './plugin.schema.js'

export type PluginScope = z.infer<typeof PluginScopeSchema>
export type PluginStatus = z.infer<typeof PluginStatusSchema>
export type ModuleSource = z.infer<typeof ModuleSourceSchema>
export type PluginInfo = z.infer<typeof PluginInfoSchema>