// packages/main/src/libs/tooldb/builtins.ts
import { createArchiveTool } from "./tools/archive/create_archive.js";
import { extractArchiveTool } from "./tools/archive/extract_archive.js";
import { contextInfoTool } from "./tools/context/info.js";
import { runCapTool } from "./tools/context/run.js";
import { applyPatchTool } from "./tools/fs/apply_patch.js";
import { copyTool } from "./tools/fs/copy.js";
import { diffTool } from "./tools/fs/diff.js";
import { editFileTool } from "./tools/fs/edit_file.js";
import { grepTool } from "./tools/fs/grep.js";
import { readDirTool } from "./tools/fs/read_dir.js";
import { fileMarkdownToolDef } from "./tools/fs/read_file.js";
import { readFileRangeTool } from "./tools/fs/read_file_range.js";
import { removeTool } from "./tools/fs/remove.js";
import { statTool } from "./tools/fs/stat.js";
import { writeFileTool } from "./tools/fs/write_file.js";
import { clarifyTool } from "./tools/interaction/clarify.js";
import { renderImageTool } from "./tools/media/renderimage.js";
import { createCodeCapTool } from "./tools/memory/code_cap.js";
import { dataStoreTool } from "./tools/memory/data.js";
import { kvStoreTool } from "./tools/memory/kv.js";
import { invokeToolDef } from "./tools/meta-tools/invoke.js";
import {
    loadSkillToolDef,
    queryAllKnowledgeToolDef,
    queryKnowledgeToolDef,
    searchKnowledgeBasesToolDef,
    searchSkillsToolDef,
} from "./tools/meta-tools/rag.js";
import { searchToolDef } from "./tools/meta-tools/search.js";
import { fetchUrlTool } from "./tools/net/fetch_url.js";
import { execTool } from "./tools/proc/exec.js";
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
        // 以下几个工具，暂不进入搜索。
        dataStoreTool,
        createCodeCapTool,
        // 上下文（新增）
        contextInfoTool,
        runCapTool,
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
        // 文件系统
        fileMarkdownToolDef,
        readDirTool,
        readFileRangeTool,
        writeFileTool,
        editFileTool,
        copyTool,
        removeTool,
        statTool,
        grepTool,
        diffTool,
        applyPatchTool,
        // 归档
        createArchiveTool,
        extractArchiveTool,
        // 网络
        fetchUrlTool,
        // 进程
        execTool,
        // 媒体
        renderImageTool,
        // 交互
        clarifyTool,
        // 项目记忆 / 数据（新增）
        kvStoreTool,
    ] as ToolDefinition<unknown, unknown>[];
}