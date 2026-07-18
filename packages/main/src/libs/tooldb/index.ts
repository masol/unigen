export { GlobalToolDB, globalToolDB, toolTableName } from "./globaltooldb.js";
export { toolDbDirName } from "./path.js";
export { defaultReranker } from "./rerank.js";
export { searchTool, searchToolsToolName } from "./searchtool.js";
export type {
    McpServerConfig,
    RegisteredTool,
    Reranker,
    ToolMeta,
    ToolSearchResult,
    ToolSource
} from "./type.js";


/**
import { globalToolDB } from "$libs/tooldb/index.js";

// 应用启动(main.ts):先 open,再全量对齐
await globalToolDB.open(myBuiltinTools);
const { failed } = await globalToolDB.setMcpServers(configService().get("mcp_servers") ?? []);
if (failed.length) notifyUser(`以下 MCP 服务连接失败: ${failed.join(", ")}`);

// 配置界面保存单个 server(configService 落盘之后):
try {
    await globalToolDB.upsertMcpServer(savedCfg);
} catch (e) {
    // 连接失败,向用户反馈;持久化的配置仍然保留,用户可修正后重试
}

// 配置界面删除单个 server(configService 落盘之后):
await globalToolDB.rmMcpServer(removedId);
 */
