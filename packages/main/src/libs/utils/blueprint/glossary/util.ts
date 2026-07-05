 
import type { CapaIOType } from "$libs/utils/db/schema/capatype.js";


/**
 * 从一个具体的io对象中获取其对应的fieldKey，如果无法确定，返回空字符串。注意: 根据intent来获取fieldKey的处理过程--被称为基于Blackboard的意图路由（Intent Routing）-- (将kv表当作词汇表，做重排计算)，属于另外一个LLM介入的异步模块。需要在调用本函数前执行以确保fieldKey已经被正确计算出来。否则返回空字符串。

  注意：返回的fieldKey是一个mustache模板，需要实例化后才能使用--除非字符串中无变量(无数组)。
//*/
export function getFieldkey(io: CapaIOType, subId?: string): string | null {
    if (io.fieldKey) {
        return subId ? `${io.fieldKey}_${subId}` : io.fieldKey;
    }
    return null
}
