import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import type { JsonValue } from "../type.js";
import { STORAGE_PREFIX } from "./vars.js";

/**
 * 加载 _T_xxx 变量。
 * 查找优先级:PrjDB 存储 > defaults > 空串
 */
export async function loadStorageVars(
    names: string[],
    ctx: IRunnerContext,
    defaults: Record<string, JsonValue>,
): Promise<Record<string, JsonValue>> {
    const out: Record<string, JsonValue> = {};
    if (names.length === 0) return out;

    const prjdb = PrjDB.ensure(ctx.prj);

    for (const n of names) {
        const bare = n.startsWith(STORAGE_PREFIX) ? n.slice(STORAGE_PREFIX.length) : n;
        const stored = prjdb.get(bare);
        if (stored !== null && stored !== undefined) {
            out[n] = stored as JsonValue;
        } else if (bare in defaults) {
            out[n] = defaults[bare];
        } else {
            Logger.debug(`[PAC] _T_${bare} 未在存储中,且无 setDefault,渲染为空串`);
            out[n] = "";
        }
    }

    return out;
}