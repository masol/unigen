// packages/main/src/libs/tooldb/builtins.ts
import { clarifyTool } from "./tools/clarify.js";
import { fileMarkdownToolDef } from "./tools/file-markdown.js";
import { invokeToolDef } from "./tools/meta-tools/invoke.js";
import {
    loadSkillToolDef,
    queryAllKnowledgeToolDef,
    queryKnowledgeToolDef,
    searchKnowledgeBasesToolDef,
    searchSkillsToolDef,
} from "./tools/meta-tools/rag.js";
import { searchToolDef } from "./tools/meta-tools/search.js";
import { renderImageTool } from "./tools/renderimage.js";
import type { ToolDefinition } from "./type.js";

/**
 * 框架 meta 工具（search_tools / invoke_tool / skills / knowledge 系列）。
 *
 * 由 globalToolDB 在 init 时兜底注册，不进入 searchsrv 的 tool 检索表。
 *
 * **必须以函数形式导出，不要在模块顶层构造常量数组**：
 * globaltooldb ↔ meta-tools/invoke|search 之间存在循环依赖，
 * 模块级常量数组会在 invoke.ts / search.ts 模块体执行前求值，
 * 导致其中某些 def 为 undefined。函数在运行时（init 异步任务内）调用，
 * 此时所有模块体均已完成，live binding 已就绪。
 */
export function getMetaTools(): ToolDefinition<unknown, unknown>[] {
    return [
        searchToolDef,
        invokeToolDef,
        searchSkillsToolDef,
        loadSkillToolDef,
        searchKnowledgeBasesToolDef,
        queryKnowledgeToolDef,
        queryAllKnowledgeToolDef,
    ] as ToolDefinition<unknown, unknown>[];
}

/**
 * 内置工具注册处。
 *
 * 返回 ToolDefinition 数组，会在 globalToolDB.init() 中逐个注入 Registry。
 * description 面向意图写清楚（“这个工具能做什么”），供检索自然语言命中；
 * 任何在此添加的工具无需改动其他代码。
 *
 * 返回值包含 meta 工具，便于 init 一次性注入；#ensureMetaTools 会再做一次
 * 幂等兜底（防止调用方只传业务工具时漏注册 meta）。
 */
export function getBuiltinTools(): ToolDefinition<unknown, unknown>[] {
    return [
        ...getMetaTools(),
        fileMarkdownToolDef,
        renderImageTool,
        clarifyTool,
    ] as ToolDefinition<unknown, unknown>[];
}