// packages/main/src/libs/coderuntime/catalog/ffmpeg.ts
//
// FFmpeg 引擎的工具清单。
//
// 一个引擎对应**多个**工具是常态（`run_ffmpeg` + `probe_media`），因此
// `EngineToolLoader` 的返回类型是数组，`#registerEngineTools` 逐个做
// 幂等注册、`disableEngine` 逐个注销。
//
// ⚠️ 新增 / 移除 FFmpeg 工具**只需改本文件**，`manager.ts` 无需变动。

import type {
    AnyToolDefinition,
    EngineToolLoader,
} from "./types.js";

export const ffmpegTools: EngineToolLoader = async () => {
    const mod = await import("../tools/ffmpeg.js");
    return [
        mod.ffmpegRunTool as AnyToolDefinition,
        // `probe_media` 与 `run_ffmpeg` 来自同一引擎：二者共享同一个
        // `ffmpeg` 可执行文件与 `ffprobe` 同目录解析逻辑（见
        // `engines/ffmpeg.js` 的 `resolveFfprobeCommand()`）。
        mod.probeMediaTool as AnyToolDefinition,
    ];
};