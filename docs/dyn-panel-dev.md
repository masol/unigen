# 动态面板：代码级扩充指南

面向**组件开发者**。讲清整套渲染管线的工作原理，以及新增一种节点类型时
在代码侧需要动的每一处。

---

## 1. 架构总览

面板本质是「一棵 JSON（AST） + 一个数据服务（ValueService）」的组合：

```

setupActivities
│  注入 { ast: PanelNode, service: IValueService }
▼
Entry.svelte ──► NodeRenderer.svelte ──► registry.resolveNode(type)
▲                                    │
└──────────── 递归子节点 ◄────────────┘
│
▼
具体节点组件（nodes/\*.svelte）
props 恒为 { node, service }
│
▼
useBinding(service, () => node.binding)   ← 读写数据的唯一通道
│
▼
IValueService（fetch / getState / onChange / set / rm / file\*）

```

**三条数据流的职责分离**：

| 层            | 负责什么                                              | 不负责什么               |
| ------------- | ----------------------------------------------------- | ------------------------ |
| AST（ast.ts） | 描述结构与所有展示文案、视觉修饰字段                  | 任何业务逻辑、异步       |
| 组件（nodes） | 把 node 字段渲染成 UI、把交互转成 binding 读写        | 直接调 onChange/生命周期 |
| binding 层    | key 的异步拉取、main 静默变更订阅、卸载注销、readonly | 具体节点长什么样         |
| ValueService  | 真正的数据存取（key/value 与文件资源）                | UI                       |

---

## 2. 核心模块逐个说明

### 2.1 `ast.ts` —— 节点类型定义

- 每种节点一个 `interface`，用字面量 `type` 区分，全部并入 `DynNode` 联合。
- **需要读写数据的节点必须带 `binding: Binding`**（见 `binding.svelte.ts`）。
- **视觉修饰也是数据**：徽章文本 / 色类名 / 图标名等一律作为 AST 字段，
  绝不写死在组件里。
- `keyOf(node, index)`：生成列表稳定 key。优先 `binding.readKey`，
  其次 `title`，最后 `don-${index}`。递归渲染 `{#each}` 必须用它。

### 2.2 `binding.svelte.ts` —— 数据绑定契约（横切能力）

对外三样东西：

- `interface Binding`：`readKey` / `writeKey?` / `readonly?` / `track?` / `schema?`（预留）。
- `useBinding(service, () => node.binding): BoundHandle`：**必须在组件 `<script>`
  顶层、非条件分支调用**（内部用 `$effect` / `onDestroy` 管理订阅生命周期）。
  返回响应式句柄：
  - `b.value` / `b.loading` / `b.error` / `b.readonly`（只读，模板直接用）
  - `await b.set(next)`（readonly 时静默拒绝并返回 `false`）
- 安全读取工具（**唯一来源，勿从别处 import 同名函数**）：
  `coerceString` / `coerceStringOr(v, fallback)` / `coerceList<T>(v)`。
- `writeKeyOf(b)`：取写 key（`writeKey ?? readKey`）。

内部行为（作者无需干预，但要理解）：

- `track !== false`（默认）→ 走 `getState` 拿首帧 + `onChange` 订阅 main 变更。
- `track === false` → 仅 `fetch` 一次，不订阅。
- **空 `readKey` 短路**：不 fetch、不订阅（用于「条件性 binding」占位）。
- `readKey` 变化时自动重订阅；组件卸载自动注销。

### 2.3 文件类绑定 hook

走「文件资源」（按目录、非 key）的节点用这些，而非 `useBinding`：

- `useBoundFiles(service, () => node.dir)` → `state.snapshot`（`value/loading/error`）。
- 增删走 `service.fileAdd(dir, paths)` / `service.fileRemove(dir, [item])`。
- 参考 `ImageGridNode.svelte`。

> `useBoundValue` 是 `useBinding` 出现前的旧 hook，能力被 `useBinding` 覆盖；
> 新节点一律用 `useBinding`。

### 2.4 `registry.ts` —— type → 组件映射

- `NODE_REGISTRY`：一行注册 `"type": Component`。
- `resolveNode(type)`：查不到返回 `null`，由 `NodeRenderer` 渲染「未知节点」兜底。

### 2.5 `NodeRenderer.svelte` / `Entry.svelte`

- `NodeRenderer`：`resolveNode(node.type)` → 渲染对应组件或兜底。**dispatcher，
  新增节点无需改它**。
- `Entry`：接收 `setupActivities` 注入的 `{ ast, service }`，渲染根 `PanelNode`。

---

## 3. 新增一种节点类型：四步

### ① 在 `ast.ts` 加接口并入联合

```ts
export interface RatingNode {
    type: "rating";
    binding: Binding;          // 需读写数据 → 必带
    label: string;
    max?: number;              // 展示参数也进 AST，不写死
}

export type DynNode =
    | /* …既有… */
    | RatingNode;
```

**红线**：任务中立；JSON 未给的字段不渲染、不用业务默认值补语义；不引入人工 id。

### ② 写 `nodes/Rating.svelte`，props 恒为 `{ node, service }`

```svelte
<script lang="ts">
  import type { IValueService } from "$lib/store/ui/activity/type";
  import type { RatingNode } from "../ast";
  import { coerceStringOr, useBinding } from "../binding.svelte";

  let { node, service }: { node: RatingNode; service: IValueService } = $props();

  // 顶层、非条件分支调用
  const b = useBinding<string>(service, () => node.binding);
  let value = $derived(coerceStringOr(b.value, ""));

  async function pick(v: string) {
    await b.set(v);   // readonly 自动拒绝，无需自查
  }
</script>

<!-- 用 b.loading / b.error / b.readonly 处理加载与只读态 -->
```

要点：

- **数据读写一律经 `useBinding`**，切勿自己调 `service.onChange` 或管订阅。
- coerce\* 工具从 `../binding.svelte` 导入（唯一来源）。
- 容器类节点用 `NodeRenderer` 递归 children，`{#each children as c, i (keyOf(c, i))}`。

### ③ 在 `registry.ts` 注册一行

```ts
import Rating from "./nodes/Rating.svelte";

export const NODE_REGISTRY = {
  /* … */
  rating: Rating,
};
```

dispatcher 无需改动。

### ④ 文件资源型节点（可选）

若按目录管理文件而非 key：AST 用 `dir` 字段，组件用 `useBoundFiles` +
`service.file*`，参考 `ImageGridNode`。

---

## 4. 铁律清单（提交前自检）

- [ ] 组件 props 恰为 `{ node, service }`。
- [ ] 所有数据读写经 `useBinding` / `useBoundFiles`，无手写订阅。
- [ ] `useBinding` 在 `<script>` 顶层、非条件分支调用。
- [ ] coerce\* / writeKeyOf 从 `../binding.svelte` 导入。
- [ ] 递归渲染用 `keyOf`，无人工 id。
- [ ] 无业务默认值；JSON 缺字段则不渲染。
- [ ] `registry.ts` 已注册；`DynNode` 联合已加入新接口。
- [ ] 视觉修饰（徽章/色/图标）来自 AST 字段，未写死。
