import type { IProjectPlugin } from "$libs/project/plugin.js";
import type { IProjectContext } from "$libs/project/type.js";
import { Plugin as VideoPlugin } from './video/index.js';


class PluginManager {
    async load(pluginId: string, prj: IProjectContext): Promise<IProjectPlugin | null> {
        if (pluginId === "video") {
            return await VideoPlugin.create(prj);
        }
        return null;
    }
}



export const pluginManager = new PluginManager();