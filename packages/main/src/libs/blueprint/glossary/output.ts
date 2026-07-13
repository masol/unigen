import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { throwNotimplement } from "$libs/utils/err.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { isPlainObject } from "radashi";
import { MetagRow } from "../metag/is.js";
import { getFieldkey } from "./util.js";

function upcertOutput(prjDB: PrjDB, output: MetagRow, key: string, value: unknown) {
    if (output.reducer) {
        switch (output.reducer) {
            case 'replace':
                break;
            case 'merge':
                {
                    const older = prjDB.get(key);
                    if (older && isPlainObject(older) && isPlainObject(value)) {
                        prjDB.set(key, {
                            ...older,
                            ...value
                        })
                        return;
                    }
                }
                break;
            default:
                throwNotimplement(`尚未实现reducer策略:${output.reducer}。`);
        }
    }
    prjDB.set(key, value);
}

/**
 * 保存数据到输出，本函数只提供单个输出的保存功能。
 * @param ctx 
 * @param output 
 * @param value 裸值。但是如果是数组-- 标准的item属性保存的是PrjTimeStore -- 可以没有updatedAt属性，但是要维护value结构。
 * @param opt 
 * @returns 
 */
export function saveToOutput(ctx: IRunnerContext, outputKey: string, value: unknown): boolean {
    const prjDB: PrjDB = PrjDB.ensure(ctx.prj);

    const output = prjDB.getMetag(outputKey)[0];
    if (!output) {
        ctx.error(`请求保存时，未能找到元术语定义:${outputKey}`)
        return false;
    }
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
                    ctx.error(`Cannot save data for output with id ${v.id} because fieldKey is missing.`);
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
    ctx.error(`请求保存时，元术语定义${outputKey}中，无法获取存储key。`)
    return false;
}
