// // 历史相关逻辑已迁移到 agent/history.ts (那里的 PrjDB.messages 才是真源)。
// // 这里保留 re-export 仅为了兼容模板渲染层既有的导入路径;
// // 新代码请直接从 ../agent/history.js 导入。
// export {
//     appendHistoryMessage, buildHistoryId, clearHistory,
//     getHistoryStore, loadHistoryMessages, loadHistoryVar,
//     registerHistoryStore, SYSTEM_FAILURE_MARKER, type HistoryStore
// } from "./history.js";
export { loadInputVar } from "./input.js";
export { loadStorageVars } from "./storage.js";
export {
    BI_PREFIX, classifyVars, emptyBuckets, HISTORY_VAR, INPUT_VAR, SKILL_DOC_VAR, STORAGE_PREFIX, TOOL_DOC_VAR
} from "./vars.js";

