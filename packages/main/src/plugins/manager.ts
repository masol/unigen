import type { IProjectPlugin } from "$libs/project/plugin.js";
import type { IProjectContext } from "$libs/project/type.js";
import { throwNotimplement } from "$libs/utils/err.js";
import { Plugin as VideoPlugin } from './video/index.js'


class PluginManager {
    async load(pluginId: string, prj: IProjectContext): Promise<IProjectPlugin> {
        if (pluginId === VideoPlugin.type) {
            return await VideoPlugin.create(prj);
        }
        throwNotimplement(`尚未支持插件${pluginId}`);
    }
}



export const pluginManager = new PluginManager();