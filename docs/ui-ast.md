# 动态面板 JSON 编写指南

侧边栏面板由一棵 JSON 描述。你只写 JSON，不碰代码。每个节点用 `type` 决定长什么样，
`children` 里放子节点。

## 通用约定

- 所有文字都写在 JSON 里（标题、提示、按钮文案……）。
- 没写的字段就不显示，别指望有默认业务值。
- 不要写 `id`，列表顺序自动处理。

## 数据绑定 binding

需要读写数据的节点，用 `binding` 指定存到哪个 key：

    "binding": { "key": "book_name" }

| 字段       | 必填 | 说明                                                                                                                               |
| ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `key`      | 是   | 存/取用的键名                                                                                                                      |
| `readonly` | 否   | `true` 只读、禁止编辑（默认可编辑）                                                                                                |
| `track`    | 否   | 是否监听「外部对这个 key 的改动」。默认 `false`：只有本控件自己改它。若这个值可能被后台流程或别处同时改动、需要自动刷新，填 `true` |

首次打开时会自动读取最新值并显示加载态，你无需关心。

## 节点类型

### panel（根容器）

    { "type": "panel", "children": [ /* 子节点 */ ] }

### accordion-section（可折叠区块）

    {
      "type": "accordion-section",
      "title": "剧本集",
      "icon": "IconScript",
      "defaultOpen": true,
      "badge": "count",
      "children": []
    }

- `icon`：图标名。
- `badge`：填字符串直接当徽章显示；填 `"count"` 会显示区块内第一个列表的条目数（会随增删自动更新）。不填则无徽章。

### field（单字段）

    {
      "type": "field",
      "binding": { "key": "book_name" },
      "label": "项目名称",
      "editor": "inline",
      "placeholder": "输入项目名称",
      "emptyHint": "未命名项目"
    }

- `editor`：`"inline"` 就地单行；`"dialog"` 弹窗多行。
- dialog 模式可加 `dialogTitle`、`dialogDescription`、`alert`。

### select（下拉单选）

    {
      "type": "select",
      "binding": { "key": "resolution" },
      "label": "分辨率",
      "icon": "IconDeviceTv",
      "fallback": "480p",
      "options": [
        { "value": "480p", "label": "480p", "sub": "标清",
          "badge": { "text": "SD", "className": "bg-foreground/10 text-foreground" } }
      ]
    }

- `fallback`：没有有效值时的默认选项（必填）。
- `badge`：`text` + `className` 做视觉标签；只给 `className` 不给 `text` 即纯色块。

### button-group（按钮组单选）

    {
      "type": "button-group",
      "binding": { "key": "pace" },
      "label": "叙事节奏",
      "fallback": "normal",
      "columns": 3,
      "options": [
        { "value": "slow", "label": "慢节奏", "sub": "强调氛围", "dot": "bg-blue-500" }
      ]
    }

- `columns`：每行几个（默认 3）；`dot`：状态色点。

### text-list（文本条目增删改）

    {
      "type": "text-list",
      "binding": { "key": "scripts" },
      "addLabel": "添加剧本",
      "emptyTitle": "还没有剧本",
      "emptyIcon": "IconBook2",
      "addDialogTitle": "添加剧本",
      "editDialogTitle": "编辑剧本",
      "confirmTitle": "删除剧本",
      "confirmMessage": "确定要删除吗？"
    }

- 列表本身存在 `key`；每条正文另存在 `key_条目id`，自动维护。

### image-grid（图片增删）

    {
      "type": "image-grid",
      "dir": "visualref",
      "addLabel": "选择参考图",
      "emptyTitle": "还没有参考图",
      "confirmTitle": "确认删除",
      "confirmMessage": "确定删除这张图片吗？"
    }

- `dir`：图片存放目录（必填，走文件而非 key）。

## 完整示例

    {
      "type": "panel",
      "children": [
        {
          "type": "accordion-section",
          "title": "全局要求",
          "icon": "IconFileText",
          "defaultOpen": true,
          "children": [
            { "type": "field", "binding": { "key": "book_name" },
              "label": "项目名称", "editor": "inline", "emptyHint": "未命名项目" }
          ]
        }
      ]
    }
