# 动态面板 AST 编写指南（使用者）

面板由一棵 JSON 树描述，自顶向下递归渲染。每个节点靠 `type` 字段选择渲染组件。
你只写 JSON，无需碰代码。

> **核心约定**
>
> 1. AST 完全任务中立：所有业务文案都写进 JSON，组件层不含任何业务假设。
> 2. JSON 未提供的字段一律不渲染，不要靠默认值补业务语义。
> 3. 不要写人工 `id`；列表 key 由 `binding.readKey` / 索引自动生成。
> 4. 数据读写全部异步：节点通过 `binding` 声明 key，由 `ValueService` 异步拉取，
>    并在 main 进程静默更新时通过 `onChange` 推送到 UI。作者无需关心加载态，
>    组件已内建 loading / error 展示。

---

## 值绑定 binding

任何需要读写数据的节点都用 `binding` 声明：

```json
"binding": { "readKey": "title", "writeKey": "title" }
```

| 字段         | 必填 | 说明                                                  |
| ---------- | -- | --------------------------------------------------- |
| `readKey`  | 是  | 读取哪个 key                                            |
| `writeKey` | 否  | 写回哪个 key；省略时等于 `readKey`                             |
| `readonly` | 否  | `true` 时可展示、禁止编辑（默认 `false`）                         |
| `track`    | 否  | 是否跟踪 main 静默变更（默认 `true`）；纯本地字段可设 `false` 省订阅        |

**异步与订阅（自动，作者无需配置）**：

* 首次渲染时组件自动异步拉取该 key，期间显示 loading。
* main 进程若静默更新该 key，通过 `onChange` 推送，UI 自动刷新。
* 组件卸载时自动注销订阅。

---

## 节点类型速查

### panel（根容器）

``` json
{ "type": "panel", "children": [ /* 任意子节点 */ ] }
```


### accordion-section（可折叠区）

```json
{
  "type": "accordion-section",
  "title": "基本信息",
  "icon": "IconFileText",
  "defaultOpen": true,
  "badge": "count",
  "children": []
}
```

* `icon`：动态图标名（走 RuntimeIcon）。
* `badge`：字符串直接显示；填 `"count"` 时自动取第一个带 `binding` 子节点的
  **列表长度**（该长度也随 `onChange` 实时更新）。缺省不显示。

### field（单字段编辑）

```json
{
  "type": "field",
  "binding": { "readKey": "docTitle" },
  "label": "文档标题",
  "editor": "inline",
  "placeholder": "输入标题",
  "emptyHint": "尚未填写",
  "readonly": false
}
```

* `editor`：`"inline"` 就地单行 / `"dialog"` 弹窗多行。
* dialog 模式可加 `dialogTitle`、`dialogDescription`、`alert`。

### select（单选下拉）

```json
{
  "type": "select",
  "binding": { "readKey": "model" },
  "label": "模型",
  "icon": "IconCpu",
  "fallback": "gpt-4",
  "options": [
    {
      "value": "gpt-4",
      "label": "GPT-4",
      "sub": "更强推理",
      "badge": { "text": "PRO", "className": "bg-primary/10 text-primary" }
    }
  ]
}
```

* `fallback`：读值无效时的回退 value（必填）。
* `badge`：视觉修饰（`text` + `className`），属于数据；只给 `className` 无 `text`
  即纯色块徽章。

### button-group（按钮组单选）

```json
{
  "type": "button-group",
  "binding": { "readKey": "priority" },
  "label": "优先级",
  "fallback": "normal",
  "columns": 3,
  "options": [
    { "value": "high", "label": "高", "sub": "尽快", "dot": "bg-red-500" },
    { "value": "normal", "label": "中" },
    { "value": "low", "label": "低", "dot": "bg-gray-400" }
  ]
}
```

* `columns`：每行按钮数，缺省 3。
* `dot`：状态色点类名。

### text-list（文本条目增删改）

```json
{
  "type": "text-list",
  "binding": { "readKey": "references" },
  "addLabel": "添加条目",
  "emptyTitle": "暂无内容",
  "emptyIcon": "IconInbox",
  "addDialogTitle": "新增条目",
  "editDialogTitle": "编辑条目",
  "confirmTitle": "确认删除",
  "confirmMessage": "此操作不可撤销"
}
```

* 列表值存于 `readKey`；每条正文另存于 `readKey_{条目id}`，由组件自动维护。

### image-grid（图片资源增删）

```json
{
  "type": "image-grid",
  "binding": { "readKey": "gallery" },
  "dir": "assets/images",
  "addLabel": "添加图片",
  "emptyTitle": "暂无图片",
  "emptyHint": "点击上方按钮添加",
  "confirmTitle": "确认删除",
  "confirmMessage": "确定要删除这张图片吗？"
}
```

* `dir`：文件资源相对目录（**必填**，走文件操作而非 key/value）。

### markdown（渲染 markdown）

```json
{ "type": "markdown", "binding": { "readKey": "summary" }, "streaming": true }
```

或内联：

```json
{ "type": "markdown", "content": "# 标题\n正文…" }
```

* `content` 与 `binding` 二选一；`streaming` 用于流式输出（如 LLM）；`error` 走错误风格。

> 注意：`markdown` 节点是否可用取决于运行时是否已注册对应组件，若渲染出
> 「未知节点类型」，说明该版本尚未提供，请联系开发者。

---

## 入口卡片 infocards（面板外的控制信息）

除面板 AST 外，还可配置进入面板的入口卡片：

```json
"infocards": {
  "input-manager": {
    "icon": "IconBook2",
    "title": "输入",
    "subtitle": "原始素材",
    "summary": "管理任务的原始输入与要求，点击进入查看与编辑。",
    "activity": "input-manager",
    "hint": "点击进行配置"
  }
}
```

| 字段         | 说明                              |
| ---------- | ------------------------------- |
| `icon`     | 卡片图标（RuntimeIcon 名）              |
| `title`    | 主标题                             |
| `subtitle` | 副标题                             |
| `summary`  | 摘要说明                            |
| `activity` | 点击进入的 activity 标识；留空 `""` 表示无跳转 |
| `hint`     | 底部提示文案                          |

---

## 完整示例

```json
{
  "type": "panel",
  "children": [
    {
      "type": "accordion-section",
      "title": "文档信息",
      "icon": "IconFileText",
      "defaultOpen": true,
      "children": [
        {
          "type": "field",
          "binding": { "readKey": "title" },
          "label": "标题",
          "editor": "inline",
          "emptyHint": "未命名文档"
        },
        {
          "type": "select",
          "binding": { "readKey": "status" },
          "label": "状态",
          "fallback": "draft",
          "options": [
            { "value": "draft", "label": "草稿" },
            { "value": "published", "label": "已发布" }
          ]
        }
      ]
    }
  ]
}
```