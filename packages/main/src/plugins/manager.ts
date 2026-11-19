import type { IProjectPlugin } from "$libs/project/plugin.js";
import type { IProjectContext } from "$libs/project/type.js";


class PluginManager {
    async load(_pluginId: string, _prj: IProjectContext): Promise<IProjectPlugin | null> {
        // if (pluginId === "video") {
        //     return await VideoPlugin.create(prj);
        // }
        return null;
    }
}



export const pluginManager = new PluginManager();