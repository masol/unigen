# MCP Route

MCP 连接池。独立于 `tooldb`，通过独立的编排层 `$libs/mcp-sync` 协作，**无循环依赖**。

---

## 一、设计核心：懒加载 + idle 超时

- **`init / setServers` 只管理配置，不连接**。
- **`acquire / callTool` 惰性连接**：真实调用时才连。
- **`discoverTools` 显式连接**：用于把工具目录写入 tooldb。
- **连接复用 + idle 超时**：
  - 引用计数 > 0 时不关闭；
  - 引用归零后启动 idle 计时器（默认 **5 分钟**）；
  - 超时自动关闭连接，释放资源；
  - 再次 acquire 会取消计时器并复用现有连接。
- **长期运行不会越积越多**：空闲连接在超时后自动回收；下次用到时再懒加载。

### 连接状态机

```
        ┌──── acquire (惰性连接) ────┐
        ▼                            │
      ready ── 引用归零 ──▶ 计时器 ────┘（复用）
        │                    │
        │                    └── 超时 ──▶ closed
        │
        └── 配置变化/删除 ──▶ draining ── 引用归零 ──▶ closed
```

---

## 二、持久化边界

`tooldb` 的 ToolMeta 元数据（`id / name / description / serverId`）**持久化在 LanceDB**。但 `ToolMeta.tool`（AI SDK Tool 实例）和 `McpClient` 连接**不可持久化**。

| 内容              | 持久化 | 说明                                          |
| ----------------- | ------ | --------------------------------------------- |
| ToolMeta 静态字段 | ✅     | 重启后从 LanceDB 恢复                         |
| ToolMeta.tool     | ❌     | 每次启动后首次真实调用时，由 MCP 重新连接生成 |
| MCP 连接          | ❌     | 运行时资源；idle 超时后自动关闭               |

**因此：**

- **首次启动**（tooldb 无 MCP 记录）：主动 discover 全部 server，写入 tooldb。
- **非首次启动**：不连接任何 MCP，完全懒加载。检索命中 → `meta.tool.execute` → 首次 `acquire` → 连接建立 → 用完后进入 idle 计时。
- **idle 超时后**：连接关闭，但 tooldb 持久化元数据不变；下次调用自动重连。

---

## 三、启动接入

```ts
import { mcpRoute } from "$libs/mcp/index.js";
import { bootMcpTools } from "$libs/mcp-sync/index.js";
import { globalToolDB, syncToolsToSearchDB } from "$libs/tooldb/index.js";

// 1. tooldb 就绪（builtins + meta tools），LanceDB 恢复持久化元数据
await initGlobalToolDB();

// 2. MCP 编排：只对"首次出现的 server"连接 + 注册，其余全部懒加载
await bootMcpTools(mcpRoute, globalToolDB, configService().get("mcpServers"));

// 3. 同步到 searchsrv 的 tool 检索表
await syncToolsToSearchDB();
```

`bootMcpTools` 判定：

- `changed`：配置新增 / 变化 → 需要 discover；
- `持久化缺失`：tooldb 中该 server 无任何工具 → 需要 discover；
- 其余（unchanged + 持久化齐全）→ **不连接**。

---

## 四、配置变更

```ts
import { applyMcpChanges } from "$libs/mcp-sync/index.js";

async function onMcpConfigChanged(newServers: McpServerConfig[]) {
  const changes = await mcpRoute.setServers(newServers);
  // { changed, removed, unchanged }

  await applyMcpChanges(mcpRoute, globalToolDB, changes);
  await syncToolsToSearchDB();
}
```

`setServers` 行为（`stableStringify` 指纹比对，**全程不连接**）：

| 场景                           | diff 分类      | 编排动作                            |
| ------------------------------ | -------------- | ----------------------------------- |
| 配置**未变化**                 | `unchanged`    | 不动                                |
| 配置**新增 / 变化**            | `changed`      | `discoverTools` → `replaceMcpTools` |
| 配置**被删除**                 | `removed`      | `removeMcpTools`                    |
| 配置**从 enabled 变 disabled** | `removed`      | `removeMcpTools`                    |
| **连接失败**                   | 保留上次持久化 | `changed` 里仍会重试                |

只有 `changed` 的 server 会被连接。

---

## 五、tooldb 侧需要的接口

```ts
class GlobalToolDB {
  /**
   * 以 descriptors 为准，替换 serverId 下的全部 MCP 工具。
   * - 已存在的 id：更新 ToolMeta.tool（复用元数据，绑定新包装器）
   * - 不存在的 id：新增
   * - 本次未出现的 id：删除
   * 同步更新内存 registry + LanceDB。
   */
  async replaceMcpServerTools(serverId: string, descriptors: McpToolDescriptor[]): Promise<void>;

  /**
   * 移除 serverId 下的全部 MCP 工具（内存 + LanceDB）。
   */
  async removeMcpServerTools(serverId: string): Promise<void>;
}
```

标志：`ToolMeta.source === "mcp"` + `ToolMeta.serverId`，无需新增字段。

---

## 六、真实调用

tooldb 的 `callRealTool` 走方式 A 即可，**无需改动**：

```ts
await meta.tool.execute(args, {
  toolCallId: `invoke_tool:${meta.llmName}:${uuid}`,
  messages: [],
  abortSignal: signal,
});
```

包装器内部自动 `acquire → callTool → release`；首次调用触发惰性连接；用完后进入 idle 计时。

**idle 超时后**：连接关闭，`meta.tool` 仍是包装器（未被销毁），下次 `execute` 时包装器内部 `acquire` 会重新连接。tooldb 侧无需感知。

显式走池（方式 B）：`await mcpRoute.callTool(meta.serverId!, meta.name, args, opts);`

多次调用复用连接（方式 C）：

```ts
const lease = await mcpRoute.acquire(serverId);
try {
  await lease.callTool("foo", args1);
  await lease.callTool("bar", args2);
} finally {
  lease.release(); // 引用归零 → 进入 idle 计时
}
```

---

## 七、接口速查

| 方法                              | 连接?   | 用途                                                    |
| --------------------------------- | ------- | ------------------------------------------------------- |
| `init(servers)`                   | ❌      | 启动期入口：只保存配置                                  |
| `setServers(servers)`             | ❌      | 全量对齐配置，返回 `{ changed, removed, unchanged }`    |
| `upsertServer(cfg)`               | ❌      | 单 server 配置更新，返回 `{ changed }`                  |
| `removeServer(id)`                | 关闭    | 移除配置并关闭连接                                      |
| `discoverTools(id)`               | ✅ 惰性 | 连接 + 返回工具描述；连接不持有引用，随即进入 idle 计时 |
| `acquire(id)`                     | ✅ 惰性 | 取连接租约（多次调用复用），refCount++                  |
| `callTool(id, name, args, opts?)` | ✅ 惰性 | 单次调用（自动借还）                                    |
| `listServerTools()`               | ❌      | 查看各 server 是否已连接 + 已发现工具                   |
| `close()`                         | 关闭    | 应用退出时调用；同时清理所有 idle 计时器                |

---

## 八、idle 超时参数

`McpConnectionPool` 构造时可注入：

```ts
new McpConnectionPool({ idleTimeoutMs: 10 * 60 * 1000 });
```

- 默认 `5 * 60 * 1000`（5 分钟）。
- `<= 0` 表示不超时（不推荐；仅调试 / 特殊场景）。
- 定时器 `.unref()`，不会阻止 Node.js 进程退出。
- 应用通过 `mcpRoute` 单例使用时，用默认值；如需自定义，请自建 `McpConnectionPool` 实例，或后续为 `McpRoute` 增加 options 透传。

---

## 九、注意事项

1. `init / setServers / upsertServer` **不会连接**，只维护配置与 diff。
2. **不要在启动期主动连接所有 MCP**——用 `bootMcpTools`，它只连"需要连的"。
3. 连接空闲超时后关闭，**不清理 tooldb 持久化元数据**——下次调用会重新连接。
4. `lease.release()` 必须在 `finally` 中调用；否则引用永远 > 0，连接永不超时。
5. `meta.tool` 必须是 `descriptor.tool`（包装器）；包装器本身不会因 idle 关闭而失效。
6. 连接失败时，tooldb 持久化目录保持不变。下次启动 `bootMcpTools` 因"持久化有记录"会跳过该 server；若要强制重连，删除该 server 配置再添加（触发 `changed`）。
7. 循环依赖规则：`mcp` 和 `tooldb` 互相不 import；`sync` 同时 import 两者，是唯一的编排层。
8. `close()` 会清理所有 idle 计时器，避免进程退出后被残留 timer 阻断。
