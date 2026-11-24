// packages/main/src/libs/coderuntime/catalog/aria2.ts
//
// aria2 引擎的工具清单。
//
// ⚠️ 新增 / 移除 aria2 工具**只需改本文件**，`manager.ts` 无需变动。

import type {
    AnyToolDefinition,
    EngineToolLoader,
} from "./types.js";

export const aria2Tools: EngineToolLoader = async () => {
    const mod = await import("../tools/aria2.js");
    return [
        mod.aria2DownloadTool as AnyToolDefinition,
    ];
};