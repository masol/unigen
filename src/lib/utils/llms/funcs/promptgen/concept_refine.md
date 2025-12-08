
# 任务：概念求精

## 当前待求精的概念

- **名称**：<%~ it.name %>
- **当前定义**：<%~ it.definition %>
- **当前示例**：<%~ it.example %>
- **角色**：此概念是函数 <%~ it.functionName %> 的 <%~ it.position %>

## 上下文：相关概念（仅供参照，勿修改）

<% if (it.inputs) { %>- 输入概念：<%~ JSON.stringify(it.inputs) %><% } %>
<% if (it.output) { %>- 输出概念：<%~ JSON.stringify(it.output) %> <% } %>
<% if (it.processing) { %>- 处理概念：<%~ JSON.stringify(it.processing) %> <% } %>

## 求精要求

请对概念进行求精，考虑以下方面：

1. **定义检验**：检查是否满足充分必要、无循环、正面陈述、清晰简洁四个标准
2. **外延边界**：识别正例与易混淆的反例，明确区分标准
3. **概念边界**：检验与上下文中其他概念是否有重叠或冲突

## 输出格式

直接输出JSON，不要包含其他内容：

```json
{
  "name": "概念名称（如需改名请在此体现）",
  "definition": "求精后的定义。\n\n**边界说明**：正例包括...；反例包括...；与相关概念的区分在于...",
  "example": "最具代表性的典型示例"
}
```

注意：

- 所有字段值使用 Markdown 格式
- definition 字段应包含核心定义和边界说明
- example 字段给出1-2个最典型的示例
- 直接输出JSON，无需分析过程
