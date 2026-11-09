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
 * 内置工具注册处。
 *
 * 返回 ToolDefinition 数组，会在 globalToolDB.init() 中逐个注入 Registry。
 * description 面向意图写清楚（“这个工具能做什么”），供检索自然语言命中；
 * 任何在此添加的工具无需改动其他代码。
 *
 * 元工具 search_tools / invoke_tool / search_skills / load_skill /
 * search_knowledge_bases / query_knowledge / query_all_knowledge 也在此注册。
 * 它们不会进入 searchsrv 的 tool 检索表，避免搜索结果自指。
 */
export function getBuiltinTools(): ToolDefinition<unknown, unknown>[] {
    return [
        searchToolDef as ToolDefinition<unknown, unknown>,
        invokeToolDef as ToolDefinition<unknown, unknown>,
        searchSkillsToolDef as ToolDefinition<unknown, unknown>,
        loadSkillToolDef as ToolDefinition<unknown, unknown>,
        searchKnowledgeBasesToolDef as ToolDefinition<unknown, unknown>,
        queryKnowledgeToolDef as ToolDefinition<unknown, unknown>,
        queryAllKnowledgeToolDef as ToolDefinition<unknown, unknown>,
        fileMarkdownToolDef as ToolDefinition<unknown, unknown>,
        renderImageTool as ToolDefinition<unknown, unknown>,
        clarifyTool as ToolDefinition<unknown, unknown>,
    ];
}