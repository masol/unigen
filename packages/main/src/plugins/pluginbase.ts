import type { IProjectPlugin } from "$libs/project/plugin.js";
import type { IProjectContext } from "$libs/project/type.js";

export abstract class PluginBase implements IProjectPlugin {
    abstract type: string;
    async dispose(): Promise<void> {
    }
    abstract init(prj: IProjectContext, bCreate: boolean): Promise<void>;
}