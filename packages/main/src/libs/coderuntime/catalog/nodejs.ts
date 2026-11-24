// packages/main/src/libs/coderuntime/catalog/nodejs.ts
//
// Node.js 引擎的工具清单。
//
// ⚠️ 新增 / 移除 Node.js 工具**只需改本文件**，`manager.ts` 无需变动。
//
// 采用动态 `import()` 的原因见 `./types.ts` 的 `EngineToolLoader` 注释：
// `tools/nodejs.js` 静态引用 `../manager.js` 的单例，静态 import 会形成
// 模块环。

import type {
    AnyToolDefinition,
    EngineToolLoader,
} from "./types.js";

export const nodejsTools: EngineToolLoader = async () => {
    const mod = await import("../tools/nodejs.js");
    return [
        // 各工具的具体入参 / 出参类型无法协变到 `unknown`，这里做一次
        // 显式擦除（注册链路只使用 name / description / inputSchema /
        // execute / toModelOutput，泛型参数对运行期无意义）。
        mod.nodeRunTool as AnyToolDefinition,
    ];
};