import { z } from 'zod'
import { os, ORPCError } from "@orpc/server";
import { type PluginInfo } from '$types/index.js';
import { ModuleSourceSchema, PluginInfoSchema } from '$types/shared/plugin.schema.js'

const load = os
    .input(z.string())
    .output(ModuleSourceSchema)
    .handler(async ({ input }) => {
        void input;
        throw new ORPCError('BAD_REQUEST', {
            message: '尚未实现',
            data: { field: 'email' }
        })
    })

const getSysplugins = os
    .output(z.array(PluginInfoSchema))
    .handler(async (): Promise<PluginInfo[]> => {
        return []
    })

// 如果不存在，则新建此项记录。
const updatePlugin = os
    .input(PluginInfoSchema)
    .output(z.boolean())
    .handler(async ({ input }) => {
        const pluginId = input
        void pluginId;
        return true
    })

const rmPlugin = os
    .input(z.object({ pluginId: z.string() }))
    .output(z.boolean())
    .handler(async ({ input }) => {
        const { pluginId } = input
        void pluginId;
        return true
    })

export default {
    load,
    getSysplugins,
    updatePlugin,
    rmPlugin,
}