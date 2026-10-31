export { GlobalToolDB, globalToolDB, type InitOptions } from "./globaltooldb.js";
export { defaultReranker } from "./rerank.js";
export { searchTool, searchToolsToolName } from "./searchtool.js";
export type {
    McpServerConfig,
    Reranker,
    ToolBrief,
    ToolDefinition,
    ToolMeta,
    ToolSearchResult,
    ToolSource
} from "./type.js";

/**
import { z } from "zod";
import { globalToolDB } from "$libs/tooldb/index.js";

// 应用启动(main.ts):一次性拉起
const { mcpFailed } = await globalToolDB.init({
    builtins: getBuiltinTools(),
    toolDirs: [join(app.getPath("userData"), "user-tools")],
    mcpServers: configService().get("mcp_servers") ?? [],
});
if (mcpFailed.length) notifyUser(`以下 MCP 服务连接失败: ${mcpFailed.join(", ")}`);

// 运行期注册任意函数为工具
const meta = await globalToolDB.register({
    name: "sum",
    description: "对两个整数求和",
    inputSchema: z.object({ a: z.number().int(), b: z.number().int() }),
    outputSchema: z.object({ sum: z.number().int() }),
    execute: ({ a, b }) => ({ sum: a + b }),
});

// 查询 + 组装 ToolSet
const hits = await globalToolDB.searchTools("把两个数字相加");
await streamText({
    model, prompt,
    tools: globalToolDB.toToolSet(hits.map(h => h.id), { includeSearchTool: true }),
});

// 配置界面保存/删除单个 MCP(configService 落盘之后)
await globalToolDB.upsertMcpServer(savedCfg);
await globalToolDB.rmMcpServer(removedId);
 */