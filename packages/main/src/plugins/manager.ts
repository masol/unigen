import type { IProjectPlugin } from "$libs/project/plugin.js";
import { throwNotimplement } from "$libs/utils/err.js";
import { Plugin as VideoPlugin } from './video/index.js'


class PluginManager {
    async load(pluginId: string): Promise<IProjectPlugin> {
        if (pluginId === VideoPlugin.type) {
            return await VideoPlugin.create();
        }
        throwNotimplement(`尚未支持插件${pluginId}`);
    }
}



export const pluginManager = new PluginManager();