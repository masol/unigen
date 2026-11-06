# PAC Agent 运行期说明

本目录（`agent/`）负责把编译产物 `CompiledPacAgent` 跑起来：选模型、拼消息、装配工具、驱动 AI SDK 的 `ToolLoopAgent`、把 thinking / 正文 / 工具调用实时上报为 trace，并按需持久化。

## 文件职责

| 文件           | 职责                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| `core.ts`      | `PacAgent` 类，实现 `IPacAgent` / `IAgentExecutor`，是根 run 与子 agent run 的入口 |
| `execution.ts` | `executeAgent`：一次 agent 执行的完整编排                                          |
| `executor.ts`  | `streamAgent` / `generateAgent`：驱动 AI SDK 并解析流式事件                        |
| `lifecycle.ts` | trace 节点与 message 的开始 / 成功 / 失败 / 中断处理                               |
| `callbacks.ts` | `onToolExecutionStart` / `onToolExecutionEnd`，工具调用的 trace                    |
| `history.ts`   | 从 `PrjDB.messages` 读取会话历史                                                   |
| `tools.ts`     | `materializeTools` / `buildAgentTool`，把 `toolRefs` 变成运行期 ToolSet            |
| `buffer.ts`    | `MessageDeltaBuffer`，正文 delta 的批量落库                                        |
| `types.ts`     | 类型、`TraceIdRegistry`、`PacRunState`、`IAgentExecutor`                           |

## 入口与运行状态

```ts
PacAgent.run(ctx)              // 根 agent
PacAgent.runWithInputs(...)    // 复用外部 state 的执行入口
PacAgent.runSubAgent(...)      // 子 agent（作为父 agent 的一个 tool 被调用）
```

每次 run 创建一个 `PacRunState`：

```ts
{
  messageId,        // 本次 assistant 消息 id（persist=false 时为临时 UUID）
  counters,         // 各内部键的序号（agent / tool / ...）
  thinkingStates,   // 每个 agent 节点的 reasoning 状态
  idRegistry,       // 内部语义键 → 对外 UUID
  persist,          // 是否写库（messages 与 trace 同时受控）
}
```

`TraceIdRegistry` 是 trace id 的核心约束：**内部键只在本进程内用于关联同一节点，对外（事件、数据库）一律是 UUID**。这样同一个 agent 在不同 message 中被调用时不会互相覆盖 trace 行。

子 agent 复用父 run 的 `state`（同一 `messageId`、同一 `idRegistry`、同一 `persist`），因此子 agent 的 trace 会挂在同一条消息的 trace 树上。

## executeAgent 的编排顺序

1. **输入校验**：`compiled.inputSchema.safeParse(rawInputs)`。失败只告警，仍以原值继续（根 agent 不校验）。
2. **合并默认值**：`inheritedDefaults + compiled.ownDefaults`（来自 `setDefault`）。
3. **模型选择**：`resolveModelOptions(ctx)` 读 `prjdb.get("model")`，再 `getSmartModel`。
4. **trace 初始化**：为本次 agent 生成 `agentTraceNodeId` 与 `agentIdentity`。
5. **根 agent 特判**（`isRoot`）：
   - 正常模式：`updateSessionTitle` + 保存 user 消息（`persist` 时）；
   - `rerun` 模式：从历史 user 消息恢复 `ctx.cmd.body` / `args`，截断该时间点之后的消息；
   - 保存 assistant 占位消息，发 `message.start`。
6. **构建工具**：`materializeTools` 把 `toolRefs` 实例化为 AI SDK `Tool`；子 agent 类型用 `buildAgentTool` 包成 tool。
7. **构建 messages**：
   - `renderSystemPrompt` 渲染系统提示词；
   - `buildUserPrompt` 渲染 user 提示词；
   - `loadPriorMessages` 从 `PrjDB.messages` 取历史（排除本轮 user / assistant 占位）；
   - 最终 `[...prior, userMessage]`。
8. **构建 ToolLoopAgent**：`model` / `instructions` / `tools` / `stopWhen: isStepCount(maxSteps)` / `reasoning` / 其余 SDK 选项。
9. **执行**：
   - 需要流式时先 `streamAgent`，抛错则 fallback 到 `generateAgent`；
   - 非流式直接 `generateAgent`。
10. **收尾**：中断 → `handleAbort`；失败 → `handleFailure`；成功 → `finishAgentTrace`。根 agent 额外 `finishRootMessage`（发 `message.end` / `message.error`，`persist` 时 `finishMessage`）。
11. **失败向上抛**：子 agent 失败会以异常形式回到父 agent 的工具调用上下文。

## 流式事件处理（executor.ts）

AI SDK 的事件顺序（工具调用后会回到 reasoning）：

```
reasoning-start → reasoning-delta* → reasoning-end → text-start → text-delta* → [tool call] → ...
```

关键决策：**`text-start` 是「思考结束、正文开始」的权威信号**，`reasoning-end` 仅作日志（部分 provider 不发送）。

- `reasoning-delta`：首次出现时创建 `reasoning` 节点（`running`），后续 delta 通过 `appendTraceDetail` + `trace.detail.delta` 增量追加。
- `text-start`：结束当前 reasoning 节点（`success`），置 `textStarted = true`。
- 再次 `reasoning-start`：说明进入下一轮思考，重置 `textStarted`，关闭上一 reasoning 节点，`reasoningCount++`。
- `text-delta`：
  - `text-start` 之前的 delta 被丢弃（属于思考内容）；
  - 根 agent 走 `message.delta`，同时写入 `MessageDeltaBuffer` 批量落库；
  - 子 agent 在首个正文字 delta 时创建 `output` 节点，走 `trace.detail.delta`。
- 流结束时补齐未关闭的 reasoning / output 节点。

## 工具调用 trace（callbacks.ts）

- 子 agent 类型工具直接跳过：其 trace 由被调用方 `executeAgent` 自己管理。
- 普通工具：`onToolExecutionStart` 创建 `tool` 节点（参数写入 `detail`），`onToolExecutionEnd` 追加结果 / 错误并 `patchTrace` 结束节点。
- 工具名冲突时 trace id 用 `state.counters` 的序号区分，UUID 由 `idRegistry` 派生。

## 历史（history.ts）

- 真源是 `PrjDB.messages`（按 `sessionId` 聚合），无独立 HistoryStore。
- 过滤规则：`mode === "cmd"` 跳过；`excludeMessageIds` 跳过；空 assistant 跳过；`isError` 的 assistant 用 `SYSTEM_FAILURE_MARKER` 替换。
- 仅根 agent 读历史；子 agent 上下文由 `inputs` 显式传入。
- 末尾是孤立 user 时补一条占位 assistant，避免部分 provider 报错。

## 持久化开关 persist

`compiled.settings.persist`（默认 `true`）统一控制：

- `persist=false`：不写 `messages` 表，不写 trace 表，`MessageDeltaBuffer` 不再落库；
- 但 `ctx.report` 事件照常发送，前端仍能看到完整的 message / trace 流；
- `messageId` 退化为临时 UUID，不进入数据库。

## 推理等级 reasoning

- `compiled.settings.reasoning` 直接透传到 `ToolLoopAgent` 的顶层 `reasoning` 参数，由 AI SDK 跨 provider 映射与降级（Anthropic budget、OpenAI effort、Google thinkingLevel 等不再手写）。
- 唯一保留的 `providerOptions` 是 Google 的 `thinkingConfig.includeThoughts: true`：这是 display 设置，需要它 provider 才会返回 reasoning 文本；仅当 `reasoning !== "provider-default"` 时注入。

## 其他 SDK 选项

`temperature` / `maxOutputTokens` / `toolCallConcurrency` / `strict` 在 `settings` 中为 `undefined` 时不传入，保持 provider 默认行为；`timeout` 透传给 `agent.stream` / `agent.generate` 的调用参数。
