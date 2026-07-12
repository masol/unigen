# 动态面板：代码级扩充指南（开发者）

新增一种节点类型时，代码侧要动的每一处。

## 1. 渲染管线

    setupActivities 注入 { ast: PanelNode, service: IValueService }
      → Entry.svelte → NodeRenderer.svelte → registry.resolveNode(type)
      → 具体节点组件（nodes/*.svelte），props 恒为 { node, service }
      → useBinding(service, () => node.binding)  ← 读写数据的唯一通道
      → IValueService（get / set / rm / subscribe / file*）

职责分离：

| 层           | 负责                                         |
| ------------ | -------------------------------------------- |
| ast.ts       | 结构 + 所有展示文案 / 视觉修饰字段           |
| nodes        | 渲染 node、把交互转成 binding 读写           |
| binding 层   | key 的读取、订阅、卸载注销、readonly、乐观写 |
| ValueService | 纯数据存取，**无缓冲、无快照**               |

## 2. ValueService 契约（无缓冲）

    get<T>(key): Promise<T | undefined>     // 永远向 main 读最新值
    set<T>(key, value): Promise<void>       // 成功后回流给订阅者，失败 throw
    rm(key): Promise<void>
    subscribe<T>(key, cb): Unsubscribe       // 监听一切变更（main + 其它组件）
    fileList / fileAdd / fileRemove / subscribeFiles
    onKvChanged(key, value)                  // 宿主推入 main 静默变更

关键：service **不持有任何值**。要缓冲/响应式，由组件侧 hook（useBinding）自己持有 `$state`。这样杜绝"快照过期"类 bug。

## 3. binding.svelte.ts

- `Binding`：`{ key, readonly?, track?, schema? }`（单一 key，无 read/write 分离）。
- `useBinding(service, () => node.binding): BoundHandle`
  - 必须在 `<script>` 顶层、非条件分支调用。
  - `b.value / b.loading / b.error / b.readonly`（只读，模板直接用）
  - `await b.set(next)`（readonly 时返回 false）
- 安全读取工具（唯一来源）：`coerceString` / `coerceStringOr(v, fallback)` / `coerceList<T>(v)`。

**track 语义（核心）**：

- 缺省（false）＝「本组件是该 key 的唯一变更源」→ 不订阅 service；
  onMount 读一次，`set()` 后本地乐观更新。最简单、最省。
- `true` ＝「main 或其它 UI 组件也可能改它」→ 订阅 service，任何来源变更都刷新。
- 空 `key` 短路：不读不订阅（用于条件性 binding 占位）。

若一个节点是在「观察」别人拥有的 key（例如 accordion 的 count 徽章数
观察 text-list 的列表 key），它自己不是变更源，**必须 track:true**。

## 4. 文件类节点

按目录管理文件（非 key）的节点用 `useBoundFiles(service, () => node.dir)`，
增删走 `service.fileAdd / fileRemove`。参考 ImageGridNode。

## 5. 新增节点：四步

1. ast.ts 加 interface 并入 DynNode 联合；需读写数据 → 带 `binding: Binding`。
2. 写 nodes/Xxx.svelte，props 恒为 { node, service }，顶层调 useBinding。
3. registry.ts 注册一行 `type: Component`。
4. 文件资源型节点用 `dir` + useBoundFiles（可选）。

## 6. 提交自检

- [ ] props 恰为 { node, service }。
- [ ] 数据读写全经 useBinding / useBoundFiles，无手写订阅。
- [ ] useBinding 在 <script> 顶层、非条件分支。
- [ ] coerce\* 从 ../binding.svelte 导入。
- [ ] 观察他人拥有的 key 时设 track:true；自己唯一变更源则缺省。
- [ ] 递归渲染用 keyOf，无人工 id；JSON 缺字段则不渲染。
- [ ] registry 已注册、DynNode 已加入。
