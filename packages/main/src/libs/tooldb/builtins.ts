import { type Tool } from "ai";
import { z } from "zod";

/**
 * 内置工具注册处。
 *
 * 在此文件添加/删除内置工具即可,初始化时会被自动注册进 GlobalToolDB:
 * - key 即工具名(builtin 工具的 id 为 `builtin::<key>`);
 * - description 会进入向量索引,供 LLM 自然语言检索,请写清楚"这个工具能做什么",
 *   面向意图描述(如"查询指定城市的当前天气"),而非实现细节;
 * - 其余任何代码无需改动。
 *
 * 示例:
 *   get_weather: tool({
 *       description: "查询指定城市的当前天气",
 *       inputSchema: z.object({ city: z.string().describe("城市名") }),
 *       execute: async ({ city }) => ({ city, temp: 25 }),
 *   }),
 */
export function getBuiltinTools(): Record<string, Tool> {
    return {
        // 目前暂无内置工具
    };
}

// 保持 z 的引用,避免空实现时的未使用导入告警;添加首个工具后可删除此行
void z;