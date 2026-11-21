// packages/main/src/libs/coderuntime/engines/index.ts

import type { CodeRuntimeEngineId } from "$types/appconfig.js";
import type { EngineRuntimeHandler } from "../types.js";
import { nodeRuntime } from "./nodejs.js";
import { pythonRuntime } from "./python.js";

/**
 * 引擎注册表。
 * 新增语言时，将对应 handler 加入此 map 即可被 manager 自动发现。
 */
export const ENGINE_HANDLERS: Record<CodeRuntimeEngineId, EngineRuntimeHandler> = {
    python: pythonRuntime,
    nodejs: nodeRuntime,
};

export const KNOWN_ENGINE_IDS = Object.keys(ENGINE_HANDLERS) as CodeRuntimeEngineId[];

export function isKnownEngine(id: string): id is CodeRuntimeEngineId {
    return id in ENGINE_HANDLERS;
}