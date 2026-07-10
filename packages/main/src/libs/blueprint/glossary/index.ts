/**
 * 维护 {@link https://openlineage.io | OpenLineage} 标准中的 DatasetFacets，
 * 主要侧重于数据时效性（即数据是否过期/新鲜度）的部分。并未实现其数据血缘维护的功能。(按照openlineage的定义，这是两个不同功能)
 * 这是一个快速实现的简化版--需在未来接入openlineage，支持完整功能--等到有Nodejs生态的库出现后接入 :-)
 * 
 * @packageDocumentation
 * 
 * 本文件将术语表中的辅助函数，专门封装为一个对象，供code cap使用。
 * 
 * @remarks
 * 该模块致力于实现 OpenLineage 的 Dataset 特性。
 * 关于数据依赖关系（数据血缘）的跟踪：
 * - 考虑过使用高阶函数进行自动跟踪。
 * - 但这可能与 AI 的自动规划产生冲突。AI 在进行规划时，不应过度依赖历史的数据血缘信息，而应根据目标动态生成。
 * 
 * @todo
 * 1. 完善当前数据时效性的验证逻辑。
 * 2. 未来引入逻辑库（如 swi-prolog）以支持无限递归方式的维度关系维护（当前版本不支持维度之间的逻辑一致性）。
 * 3. 规范化维度关系的自维护，避免过度依赖 LLM 直觉（这是产生幻觉和缺乏条理的根源）。
 */

import type { IRunnerContext } from "$types/blueprint/context.js";
import { getIOInfo } from "./ioinfo.js";
import { saveToOutput } from "./output.js";


export function getGlossary(ctx: IRunnerContext) {
    return {
        getIO: getIOInfo.bind(null, ctx),
        save: saveToOutput.bind(null, ctx),
        //getPair: //从withTime数据中，获取指定下标，自动计算是否过期，并返回原数据。//@todo: 侵入式 or 非侵入式？
    }
}