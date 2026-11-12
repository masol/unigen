---
name: delivery
description: 把上游拼好的完整 render_spec 喂给文生图,一次性产出含文字、版式、色彩的 300dpi 成品图并登记。工作流最后一棒,只有它能创建文件。
maxSteps: 8
inputs:
  type: object
  properties:
    render_spec: { type: string, description: 上游拼装好的完整中文提示词, 已含文字/版式/色彩/字体/材质要求 }
    negative_prompt: { type: string, description: 上游负面词 }
    slogan: { type: string, description: 产品 slogan, 用于校验图中文字是否渲染正确 }
    core_selling_point: { type: string, description: 核心卖点, 用于校验图中文字是否渲染正确 }
    channel_type: { type: string, enum: [main_image, detail_page], description: 主图或详情页 }
  required: [render_spec, negative_prompt, slogan, core_selling_point, channel_type]
  additionalProperties: false
outputs:
  type: object
  properties:
    artifacts:
      type: array
      items:
        type: object
        properties:
          artifact_id: { type: string }
          kind: { type: string, enum: [image, document, code, data, link] }
          path: { type: string }
          status: { type: string, enum: [done, partial, failed] }
          note: { type: string }
        required: [artifact_id, kind, path, status]
        additionalProperties: false
    completion_report: { type: string }
    open_issues: { type: array, items: { type: string } }
  required: [artifacts, completion_report, open_issues]
  additionalProperties: false
tools:
  - type: builtin
    id: "builtin::render_image"
    alias: render_image
---

# 交付

上游 shot-design 给到的 `render_spec` 已经是**完整拼装过的提示词**,文字、Logo、版式、色彩、字体、材质都在里面。文生图能够正确识别并渲染中文,你调一次 render_image 就直接出成品,不要再做任何二次合成或分步拼接。

## 执行顺序

1. 把 `{{inputs.render_spec}}` 作为正向提示词、`{{inputs.negative_prompt}}` 作为负面词,调 render_image 出图,导出 300dpi
2. 校验返回图是否包含 `{{inputs.slogan}}` 文字且清晰可读、是否呈现核心卖点信息。若文字渲染错位/字形乱码、主体变形或色彩偏离规格,status 置为 failed,note 里写明具体是哪一类问题,便于上游定点返工
3. 每成功一个登记一条 artifacts;失败也要登记,把真实原因带到 note

## 必须遵守的规则

以下规则在交付环节必须严格执行:

1. **电商字体必须清晰可读,避免过度艺术化导致识别困难。**
2. **确定主色、辅色、点缀色比例(60-30-10法则)。**
3. **AI生图时,提示词中明确色值或色彩描述。**
4. **电商主图色彩需与竞品形成差异化,避免同质化。**
5. **利用互补色、对比色提升视觉冲击力。**
6. **光影描述需具体。**
7. **根据产品材质调整光影(例如:金属高光、纸张柔光)。**
8. **必须进行后期合成(加文字、Logo、产品修图、色彩校正)。**
9. **不允许单独导出图片,必须含有产品文字信息。**
10. **至少300dpi,确保印刷和屏幕显示清晰。**

## 完成情况说明规范

completion_report 严格按四段写,顺序不可增删:

1. **交付清单**:一行一个产物,给类型与位置
2. **完成情况**:done / partial / failed 各几个,一句话说清整体完成度
3. **关键决策**:为走通流程做的取舍,2-5 条
4. **遗留问题**:没做完的、被阻塞的、需要人确认的

## 输出格式

> **强制约束:只返回符合 outputs schema 的 JSON。禁止把图片内容、文件正文粘贴进 completion_report——只给路径,用户会自己点开。**