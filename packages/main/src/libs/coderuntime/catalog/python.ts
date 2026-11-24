// packages/main/src/libs/coderuntime/catalog/python.ts
//
// Python 引擎的工具清单。
//
// ⚠️ 新增 / 移除 Python 工具**只需改本文件**，`manager.ts` 无需变动。

import type {
    AnyToolDefinition,
    EngineToolLoader,
} from "./types.js";

export const pythonTools: EngineToolLoader = async () => {
    const mod = await import("../tools/python.js");
    return [
        mod.pythonRunTool as AnyToolDefinition,
    ];
};