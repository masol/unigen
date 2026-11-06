# PAC 编译期说明

本目录（`compiler/`）负责把一份 PAC markdown（front matter + 正文模板）连同其声明的工具、子 agent、用户模板、默认值，编译成一棵与运行期上下文无关的 `CompiledPacAgent` 树。编译是纯函数式的：只依赖源文件与 `prj.getPath`，不持有 `prj`，不接触 `ctx`。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `index.ts` | `compilePacAgent`：顶层入口，负责缓存创建、入口缺失时降级为直通 agent |
| `agent.ts` | `compileFile` / `compileOne`：单个 agent 文件的七阶段编译 |
| `frontmatter.ts` | 读取文件、解析 front matter、校验正文非空 |
| `paths.ts` | 路径分段解析、越界校验、`CompileCache`、`buildAgentId`、工具名去重 |
| `tools.ts` | `loadToolRefs`：把 front matter 的 tools 声明解析为 `ToolRef[]` |
| `user-template.ts` | 解析 `userTemplate` / `userTemplatePath` 及其 front matter |
| `passthrough.ts` | 构造入口文件缺失时的直通 agent |
| `body.ts` | 正文后处理钩子（预留，未实现） |

相关但不在本目录的文件：`../schema.ts`（JSON Schema ↔ Zod、工具目录、输出语义）、`../settings.ts`（settings 解析、默认值、模型选项）、`../template.ts`（变量扫描与 Handlebars 渲染）、`../context/`（内置变量与存储变量）、`../loader.ts` + `../mcp.ts`（外部工具加载）。

## 顶层入口

```ts
compilePacAgent(prjType, entry, cache?, prj?)
```

- `entry` 是入口文件相对项目根的分段路径，必须显式传入。
- 无 `cache` 时：
  - `entry` 不存在 → 返回 `buildPassthroughAgent`（直通 agent，不抛错）；
  - 存在 → `createCompileCache(entry.slice(0, -1), entry)`。
- `rootBase` = 入口所在目录；`rootEntry` = 入口文件，二者共同用于识别「根 agent」。
- 编译结果按 `segments.join("/")` 缓存在 `CompileCache.compiled`；`compiling` 集合用于循环引用检测。

## compileOne 的七阶段

1. **定位与读取**：`getAbsPath` → `extractFrontMatter`。正文为空直接抛错。
2. **正文**：当前直接使用原文作为 `systemTemplate`；`refinePacBody` 是预留钩子。
3. **元信息**：`name`（缺省用文件名）、`description`（缺省自动生成）、`id`（`buildAgentId`，相对 `rootBase` 去 `.md`）、`isRoot`（`sameSegments(sourceSegments, rootEntry)`）。
4. **输入 / 输出契约**：
   - 根 agent：`inputSchema = z.object({})`，`outputSchema = null`；若 front matter 声明了 `inputs` / `outputs`，告警并忽略；
   - 非根：`jsonSchemaToZod(fm.inputs)` / `jsonSchemaToZod(fm.outputs)`。
5. **工具引用**：`loadToolRefs` 遍历 `fm.tools`，按类型分派：
   - `agent`：`resolveProjectPath` 得到子文件分段路径，递归 `compileFile`，用别名或子 agent 名作为 `key`；
   - `builtin` / `search` / `mcp`：`loadExternalTools` 返回 `meta`，工具来自全局工具库；
   - `mcp_local`：编译期 `probeMcpMetadata` 拿元数据，运行期才真正连接；
   - 所有 `key` 经 `uniqueKey` 去重（非法字符替换、冲突加 `_2`）。
6. **工具目录**：`buildToolDoc(toolRefs)` 生成 markdown（描述、输入字段、返回语义），供父 agent 模板的 `{{_BI_tool}}` 使用。
7. **用户模板与默认值**：`resolveUserTemplate`：
   - `userTemplate` / `userTemplatePath` 二选一，同时声明报错；
   - 外部文件只允许 `setDefault` 字段，其它 front matter 字段告警忽略；
   - 都未声明时默认 `{{_BI_input}}`；
   - 用户模板的 `setDefault` 与主 agent 的 `setDefault` 合并，主 agent 优先。

随后是**变量扫描与模板补全**：

- `scanTemplateVars` 用 Handlebars AST 收集系统模板 + 用户模板中的变量，`classifyVars` 分为 `bi` / `storage` / `unknown` 三桶。
- 若声明了工具但模板没引用 `{{_BI_tool}}`，自动在系统模板末尾追加「## 可用工具 + {{_BI_tool}}」。
- 若有 `outputSchema`，`renderOutputSemantics` 把它渲染为「最终回复要点」追加到系统模板，引导 LLM 在自然语言中覆盖这些字段，而不是强制 JSON 输出。

最后 `resolveSettings(fm)` 归一化所有运行开关，产出 `CompiledPacAgent`。

## 根 agent 的特殊约束

- 输入是用户原始录入（文本 / 文档 / 语音），通过 `{{_BI_input}}` 展开，不声明 `inputs`；
- 输出是直接回复用户，不声明 `outputs`；
- 根 agent 声明这两项会在编译期告警并忽略。

## 直通 agent

入口文件不存在时返回 `buildPassthroughAgent`：无系统提示词、无工具、`userTemplate = {{_BI_input}}`，等价于把用户输入直送 LLM。`id` 为 `__passthrough__/<prjType>`。

## 路径与安全

- 所有路径都通过 `prj.getPath(segments)` 解析，`getPath` 只返回路径、不检查存在性。
- 相对路径按 `rootBase` / `currentBase` + `..` / `.` 归一化，`ensureInsideRoot` 保证不逃出 pac 根目录。
- 缺扩展名时自动补 `.md`。
- 工具名 `sanitizeToolKey`：`[^a-zA-Z0-9_-]` 替换为 `_`，截断 64 字符。

## 编译期 / 运行期边界

- `CompiledPacAgent` 是纯数据：模板字符串、Zod schema、`ToolRef[]`、`toolDoc`、`vars`、`ownDefaults`、`settings`、路径信息。不含 `prj`、不含 `ctx`、不含已连接的 MCP client。
- 需要 `prj` 的工具（如依赖项目上下文的 `LocalToolSpec.build`）在运行期由 `materializeTools` 用 `ctx.prj` 构造。
- 局部 MCP 在编译期只探测元数据（3s 超时，失败则用占位描述），运行期由 `connectLocalMcp` 真正连接，并在 run 结束时统一关闭。