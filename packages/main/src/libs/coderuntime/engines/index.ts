// packages/main/src/libs/coderuntime/engines/index.ts
//
// 引擎注册表（类级别）。
//
// 约定：
//   - 各引擎实现为 class（实现 `EngineRuntimeHandler` 接口）；
//   - 该文件是唯一"知道全部引擎类"的地方；manager 从此处 import 并在
//     构造函数中 `new` 实例化（避免模块级单例，利于 tree-shake 与测试）；
//   - 新增引擎时：实现新 class → 加入 `ENGINE_CLASSES` → 同步
//     `KNOWN_ENGINE_IDS` 与 schema。

import type { CodeRuntimeEngineId } from "$types/appconfig.js";
import { NodeRuntime } from "./nodejs.js";
import { PythonRuntime } from "./python.js";

/**
 * 全部引擎类的构造器，顺序仅用于稳定输出（findFirst 之类的场景应显式指定 id）。
 */
export const ENGINE_CLASSES: ReadonlyArray<
    new () => import("../types.js").EngineRuntimeHandler
> = [NodeRuntime, PythonRuntime];

/**
 * 已知引擎 id 列表。
 *
 * ⚠️ 必须与 `ENGINE_CLASSES` 的 `id` 字段保持同步；
 * 与 schema 中的键也保持一致。
 */
export const KNOWN_ENGINE_IDS: CodeRuntimeEngineId[] = ["nodejs", "python"];

export function isKnownEngine(id: string): id is CodeRuntimeEngineId {
    return (KNOWN_ENGINE_IDS as readonly string[]).includes(id);
}