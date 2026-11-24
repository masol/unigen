// packages/main/src/libs/coderuntime/engines/index.ts
//
// 引擎注册表（类级别）。
//
// 约定：
//   - 各引擎实现为 class（实现 `EngineRuntimeHandler` 接口）；
//   - **每个 class 暴露 `static readonly id`**，实例上的 `id` 直接引用它；
//   - 本文件是唯一“知道全部引擎类”的地方，且**只有一份清单**
//     （`ENGINE_CLASS_LIST`）：`KNOWN_ENGINE_IDS` 由它派生，不再手工维护
//     第二份 —— 漏改任一侧都会被下面的编译期断言拦下；
//   - manager 从此处 import `ENGINE_CLASSES`（**统一构造签名**的数组）
//     并在构造函数中 `new` 实例化（避免模块级单例，利于 tree-shake 与测试）；
//   - 新增引擎时：实现新 class → 加入 `ENGINE_CLASS_LIST` → 同步
//     `$types/appconfig.js` 的 `CodeRuntimeEngineId` 与 schema。
//     `manager.ts` **无需改动**；本目录之外只需再补 `catalog/<engineId>.ts`
//     （工具清单，见 `../catalog/index.ts`）。
//
// 【为什么拆成 `ENGINE_CLASS_LIST` 与 `ENGINE_CLASSES` 两个常量】
// `ENGINE_CLASS_LIST` 用 `as const` 保留完整的静态类型，用于派生
// `KNOWN_ENGINE_IDS` 与做编译期对齐断言；但它作为类型时是**构造签名的
// 联合**，对联合构造签名直接 `new` 在部分 TypeScript 版本会报
// “none of those signatures are compatible with each other”。因此对外
// 导出的 `ENGINE_CLASSES` 显式标注为统一的 `new () => EngineRuntimeHandler`
// 数组，manager 的 `new Klass()` 永远拿到稳定的单一签名。
//
// 【`KNOWN_ENGINE_IDS` 为什么声明成 `CodeRuntimeEngineId[]` 而不是更精确的
// 字面量联合】它与 `isKnownEngine()` 的 `includes` 检查、以及配置层 API
// （`enableRuntimes` 之类的入参）的类型保持一致，避免调用方多做一次收窄。

import type { CodeRuntimeEngineId } from "$types/appconfig.js";
import type { EngineRuntimeHandler } from "../types.js";
import { Aria2Runtime } from "./aria2.js";
import { FfmpegRuntime } from "./ffmpeg.js";
import { NodeRuntime } from "./nodejs.js";
import { PythonRuntime } from "./python.js";

/**
 * 全部引擎类（**保序、保类型**）。
 *
 * 顺序仅用于稳定输出 / 日志（`init()` 按此顺序逐个 ensure）；
 * 需要指定单个引擎的场景应显式传 `engineId`。
 *
 * ⚠️ 新增引擎时**只改这里**（外加 `$types/appconfig.js` 的 id 与 schema，
 * 以及 `catalog/<engineId>.ts` 的工具清单）。`KNOWN_ENGINE_IDS` 自动跟随，
 * 不需要再改第二处。
 */
const ENGINE_CLASS_LIST = [
    NodeRuntime,
    PythonRuntime,
    Aria2Runtime,
    FfmpegRuntime,
] as const;

/**
 * 对外暴露的引擎构造器数组。
 *
 * `ReadonlyArray<new () => EngineRuntimeHandler>` 让所有元素共享同一个
 * 构造签名：manager 中的 `for (const Klass of ENGINE_CLASSES) new Klass()`
 * 在所有 TS 版本下都合法，且返回类型统一为 `EngineRuntimeHandler`
 * （引擎的具体 class 类型对 manager 无意义）。
 */
export const ENGINE_CLASSES: ReadonlyArray<new () => EngineRuntimeHandler> =
    ENGINE_CLASS_LIST;

/** 引擎类声明的静态 id 联合（从 class 派生，不手工重复）。 */
type EngineClassId = (typeof ENGINE_CLASS_LIST)[number]["id"];

/**
 * 编译期断言工具：`Assert<T>` 要求 `T` 恰为 `true`。
 *
 * 用法 `Assert<条件 ? true : false>`：条件不成立时直接编译报错，
 * 比运行期日志更早、也更难被忽略。
 */
type Assert<T extends true> = T;

/**
 * 双向对齐断言（**不产生任何运行期代码**）。
 *
 * 1. 每个引擎 class 声明的 id 都必须是 `CodeRuntimeEngineId` 的成员
 *    （否则配置层无法表达该引擎的开关 / 下载源）；
 * 2. `CodeRuntimeEngineId` 的每个成员都必须有对应引擎 class
 *    （否则会出现“配置项存在、UI 可开关，但 `init()` 永远不处理”的静默失效）。
 *
 * 两向同时成立时，本文件的类清单与 `$types/appconfig.js` 完全一致；
 * 任何一侧漏改都会在这里编译失败，而不是等到运行期才发现。
 *
 * 该类型被导出：`noUnusedLocals` 不会因为“运行期无引用”而误报，
 * 同时它本身就是一份可被外部（例如测试）复用的完整性证明。
 */
export type EngineRegistryCheck =
    & Assert<EngineClassId extends CodeRuntimeEngineId ? true : false>
    & Assert<
        [Exclude<CodeRuntimeEngineId, EngineClassId>] extends [never]
        ? true
        : false
    >;

/**
 * 已知引擎 id 列表（**由类清单派生**，不再手工维护）。
 *
 * 与 `ENGINE_CLASSES` 天然同步：新增引擎只要加入 `ENGINE_CLASS_LIST`，
 * 这里自动包含它的 id。运行期顺序 = `ENGINE_CLASS_LIST` 顺序。
 */
export const KNOWN_ENGINE_IDS: CodeRuntimeEngineId[] = ENGINE_CLASS_LIST.map(
    (Klass) => Klass.id,
);

export function isKnownEngine(id: string): id is CodeRuntimeEngineId {
    return (KNOWN_ENGINE_IDS as readonly string[]).includes(id);
}