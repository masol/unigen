import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { CapaIOType } from "$libs/utils/db/schema/capatype.js";
import { throwNotimplement } from "$libs/utils/err.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log";
import { getFieldkey } from "./util.js";

function upcertOutput(prjDB: PrjDB, output: CapaIOType, key: string, value: unknown) {
    // @TODO： 需要跟随CapaIOType.reducer策略，来决定是否跟随还是覆盖。现在是直接覆盖。
    if (output.reducer && output.reducer !== 'replace') {
        throwNotimplement("尚未实现除replace之外的reducer策略。");
    }
    prjDB.set(key, value);
}

/**
 * 保存数据到输出,调用者需自行维护数组，本函数只提供单个输出的保存功能。
 * @param ctx 
 * @param output 
 * @param value 裸值。但是如果是数组-- 标准的item属性保存的是PrjTimeStore -- 可以没有updatedAt属性，但是要维护value结构。
 * @param opt 
 * @returns 
 */
export function saveToOutput(ctx: IRunnerContext, output: CapaIOType, value: unknown): boolean {
    const prjDB: PrjDB = PrjDB.ensure(ctx.prj);
    // Logger.debug("saveToOutput value=", value)
    // flatten只针对数组展开。monolith(默认值)会跳过此处--将整个数组当作单值对待。
    if (Array.isArray(value) && output.storage === "flatten") {
        const realValue: unknown[] = [];
        value.forEach((v) => {
            const { item, ...rest } = v;
            // Logger.debug("rest=", rest)
            // Logger.debug("item=", item)

            realValue.push(rest);
            if (item) {
                // 存储data.
                const key = getFieldkey(output, v.id);
                // Logger.debug("key=", key)

                if (key) {
                    upcertOutput(prjDB, output, key, item);
                } else {
                    Logger.error(`Cannot save data for output with id ${v.id} because fieldKey is missing.`);
                }
            }
        })
        value = realValue;
    }

    const key = getFieldkey(output);
    if (key) {
        if (output.schema && value) {
            const parseResult = output.schema.safeParse(value);
            if (!parseResult.success) {
                ctx.error(`Failed to parse IOdata for ${key}. Error: ${parseResult.error}`);
                return false
            }
        }

        upcertOutput(prjDB, output, key, value);
        // Logger.debug("all save to", key, value)
        return true;
    }
    return false;
}
