import type { IProjectContext } from "$libs/project/type.js";
import { throwPrecondition } from "$libs/utils/err.js";
import { pathExists } from "fs-extra";
import type { CompileCache, CompiledPacAgent } from "../type.js";
import { compileFile } from "./agent.js";
import { buildPassthroughAgent } from "./passthrough.js";
import { createCompileCache } from "./paths.js";

/**
 * 递归编译 PAC Agent。
 *
 * 顶层调用通过 entry 显式定位入口文件；入口不存在时返回直通 agent(不抛错);
 * 子级编译文件必须存在。
 *
 * CompileCache.rootEntry 记录入口文件分段路径,用于识别根 agent:
 * 根 agent 不允许声明 inputs/outputs(其输入是用户原始录入,输出是对用户的回复)。
 */
export async function compilePacAgent(
    prjType: string,
    entry: string[],
    cache?: CompileCache,
    prj?: IProjectContext,
): Promise<CompiledPacAgent> {
    if (entry.length === 0) {
        throwPrecondition(`[PAC] 编译入口为空`);
    }

    let cc = cache;

    if (!cc) {
        if (!prj) {
            throwPrecondition(
                `[PAC] 顶层编译缺少 prj，无法通过 prj.getPath([...entry]) 定位入口`,
            );
        }

        const entryAbs = prj.getPath(entry);
        if (!entryAbs || !(await pathExists(entryAbs))) {
            return buildPassthroughAgent(prjType, entry.slice(0, -1));
        }

        cc = createCompileCache(entry.slice(0, -1), entry);
    }

    if (!prj) {
        // 有 cache 但仍需 prj 才能完成缺失文件的编译;缓存命中由 compileFile 内部短路,
        // 未命中时必须提供 prj。
        throwPrecondition(`[PAC] 编译需要 prj（运行期上下文或编译期参数）`);
    }

    return compileFile(cc, entry, prj);
}

export {
    buildAgentId,
    createCompileCache,
    resolveProjectPath
} from "./paths.js";
