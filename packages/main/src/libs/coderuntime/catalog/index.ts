// packages/main/src/libs/coderuntime/catalog/index.ts
//
// 工具目录汇总：**引擎 id → 工具清单**的唯一映射点。
//
// 【为什么需要这个目录】
// 此前这段映射以 `if (id === "python") { ... }` 的形式嵌在
// `manager.ts` 的私有方法里，导致"加一个工具"必须打开
// `manager.ts`（一个职责已经很重的文件）并修改一个与安装流程毫无关系的
// 分支链。现在映射被外置到本目录：
//
//   - 每个引擎一个**小文件**（`./nodejs.js` / `./python.js` /
//     `./aria2.js` / `./ffmpeg.js`），加工具只改对应小文件；
//   - `manager.ts` 只调用 `loadEngineTools(engineId)`，不再持有会随工具
//     数量增长的列表；
//   - `ENGINE_TOOL_LOADERS` 使用 `Record<CodeRuntimeEngineId, …>`：
//     当 `CodeRuntimeEngineId` 新增成员时，本文件**编译期报错**，强制
//     补全对应 loader —— 不会出现"新引擎装好了但工具永远不注册"这类
//     静默遗漏（旧实现里漏写一个 `if` 分支只会在运行期抛
//     `未知的代码运行时引擎`）。
//
// 【以后新增工具 / 引擎时需要改哪里】
//   - 给已有引擎加工具：只改 `./<engineId>.js`（在返回数组里追加一项）；
//   - 新增引擎：新建 `./<engineId>.js`，再在本文件 `ENGINE_TOOL_LOADERS`
//     里加一行。`manager.ts` **无需改动**。
//
// 【为什么 loader 是函数（延迟加载）】
// `tools/*.js` 静态引用了 `../manager.js` 的 `codeRuntimeManager` 单例；
// 若本文件静态 import 工具定义，会形成
// `manager → catalog/index → catalog/<engine> → tools/<engine> → manager`
// 的模块环。函数包裹 + 动态 `import()` 把工具定义的求值推迟到真正注册
// 时的调用点，与改造前的行为完全一致。

import type { CodeRuntimeEngineId } from "$types/appconfig.js";
import { aria2Tools } from "./aria2.js";
import { ffmpegTools } from "./ffmpeg.js";
import { nodejsTools } from "./nodejs.js";
import { pythonTools } from "./python.js";
import type { AnyToolDefinition, EngineToolLoader } from "./types.js";

/**
 * 引擎 id → 工具加载器。
 *
 * 顺序与 `engines/index.js` 的 `ENGINE_CLASSES` 一致，仅为可读性，
 * 不影响注册行为（注册顺序由 `CodeRuntimeManager#registerEngineTools`
 * 按引擎逐个处理决定）。
 *
 * 使用完整 `Record` 而非 `Partial<Record>`：某些引擎确实没有工具时，
 * 应显式提供一个返回 `[]` 的 loader，而不是让键缺失 —— 缺键的语义
 * （"忘了登记" vs "刻意没有工具"）无法区分，前者会在运行期变成
 * 一次静默的空注册。
 */
const ENGINE_TOOL_LOADERS: Record<CodeRuntimeEngineId, EngineToolLoader> = {
    nodejs: nodejsTools,
    python: pythonTools,
    aria2: aria2Tools,
    ffmpeg: ffmpegTools,
};

/**
 * 加载指定引擎的全部工具定义。
 *
 * 返回的数组是**新数组**（每次调用都由 loader 重新构造），调用方可以
 * 自由遍历 / 过滤，不必担心共享可变状态。
 *
 * 未知 id 的防御分支：`CodeRuntimeEngineId` 是编译期联合类型，但
 * `engineId` 在运行期来自配置 / 外部调用，`isKnownEngine()` 已在
 * `ensureEngine` 处做过一次校验；这里保留同一套防御，使错误信息与
 * 改造前完全一致（调用方无需感知实现位置变化）。
 */
export async function loadEngineTools(
    engineId: CodeRuntimeEngineId,
): Promise<AnyToolDefinition[]> {
    const loader = ENGINE_TOOL_LOADERS[engineId];
    if (!loader) {
        throw new Error(`未知的代码运行时引擎：${engineId}`);
    }
    return loader();
}