// packages/main/src/libs/tooldb/tools/meta-tools/registry.ts
import { builtinId } from "../../naming.js";
import {
    invokeToolName,
    loadSkillToolName,
    queryAllKnowledgeToolName,
    queryKnowledgeToolName,
    searchKnowledgeBasesToolName,
    searchSkillsToolName,
    searchToolsToolName,
} from "./names.js";

/**
 * 框架 meta 工具名集合。
 *
 * 这些工具由框架直接挂载，不进入 searchsrv 的 tool 检索表：
 * - 避免搜索结果自指；
 * - 避免 invoke_tool 间接调用 meta 工具；
 * - query_all_knowledge 等能力属于框架召回链路，不应作为业务工具被检索。
 */
export const metaToolNames = [
    searchToolsToolName,
    invokeToolName,
    searchSkillsToolName,
    loadSkillToolName,
    searchKnowledgeBasesToolName,
    queryKnowledgeToolName,
    queryAllKnowledgeToolName,
] as const;

export type MetaToolName = (typeof metaToolNames)[number];

const metaToolIds = new Set(metaToolNames.map((name) => builtinId(name)));

/** 判断某个全局工具 id 是否属于框架 meta 工具。 */
export function isMetaToolId(id: string): boolean {
    return metaToolIds.has(id);
}

/** 只读快照，便于外部展示或调试。 */
export function getMetaToolIds(): ReadonlySet<string> {
    return metaToolIds;
}