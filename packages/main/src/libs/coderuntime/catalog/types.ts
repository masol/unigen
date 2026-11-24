// packages/main/src/libs/coderuntime/catalog/types.ts
//
// 工具目录内部共享类型。
//
// 为什么单独抽一个类型文件：
//   - `catalog/index.ts` 需要 `EngineToolLoader`，各引擎的 loader 小文件也需要；
//   - 若把类型定义在 `index.ts` 里，各 loader 就需要 `import type ... from "./index.js"`，
//     形成 index ↔ loader 的循环（纯类型循环运行时无副作用，但会让依赖图
//     难以阅读，也会被部分 lint 规则报警）；
//   - 独立一个 types 文件后，依赖方向是单向的：loader → types，index → loader + types。
//
// 为什么叫 `AnyToolDefinition` 而不是直接在 loader 里写
// `ToolDefinition<unknown, unknown>`：
//   - 同一个类型名在 4 个 loader 文件 + index 里重复出现，且后面必须跟
//     `as` 断言（各工具的具体入参 / 出参类型无法协变到 `unknown`）；
//   - 抽成别名后，断言目标统一，未来若要调整擦除策略（例如改成
//     `ToolDefinition<any, any>` 或引入新的包装）只需改一处。

import type { ToolDefinition } from "$libs/tooldb/type.js";

/**
 * 类型擦除后的工具定义。
 *
 * 工具注册 / 注销链路只关心 `name` 与 `execute`，不关心具体 schema 类型；
 * 具体泛型信息在 `ToolDefinition<Input, Output>` 的定义处已被 zod schema
 * 捕获，这里只做一次**显式**的擦除（而不是隐式 `any`）。
 */
export type AnyToolDefinition = ToolDefinition<unknown, unknown>;

/**
 * 单个引擎的工具加载器。
 *
 * 必须是**函数**而不是常量数组：工具定义模块（`tools/*.js`）静态引用了
 * `../manager.js` 的单例，若在此处静态 import，会形成
 * `manager → catalog → tools → manager` 的模块环；用函数包裹后，
 * 动态 `import()` 发生在真正需要注册工具的时刻，循环自然消失。
 */
export type EngineToolLoader = () => Promise<AnyToolDefinition[]>;