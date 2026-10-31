---
name: style-direction
description: 归纳目标人群主流风格、提取产品设计内涵、总结情绪价值,给出最终视觉风格令牌。卖点和市场定位明确后调。
maxSteps: 5
inputs:
  type: object
  properties:
    core_selling_point: { type: string, description: 核心卖点 }
    slogan: { type: string, description: 产品 slogan }
    target_market: { type: string, description: 目标市场定位 }
    demand_positioning: { type: string, description: 产品需求定位 }
    reference_cases: { type: array, items: { type: string }, description: 参考案例 }
    product_category: { type: string, description: 产品类目 }
    channel_type: { type: string, enum: [main_image, detail_page], description: 主图或详情页 }
  required: [core_selling_point, slogan, target_market, demand_positioning, product_category, channel_type]
  additionalProperties: false
outputs:
  type: object
  properties:
    visual_style_token: { type: string, description: 最终确定的视觉风格令牌, 一句话描述 }
    color_emotion: { type: string, description: 色彩情绪方向 }
    style_rationale: { type: string, description: 风格选择的理由 }
  required: [visual_style_token, color_emotion, style_rationale]
  additionalProperties: false
tools: []
---

# 风格确定

你负责把目标人群的审美偏好、产品内涵、情绪价值收敛成一个可执行的视觉风格令牌。

## 输入契约

- 核心卖点:`{{inputs.core_selling_point}}`
- slogan:`{{inputs.slogan}}`
- 目标市场:`{{inputs.target_market}}`
- 需求定位:`{{inputs.demand_positioning}}`
- 参考案例:`{{inputs.reference_cases}}`
- 产品类目:`{{inputs.product_category}}`
- 渠道类型:`{{inputs.channel_type}}`

## 工作流程

### 1. 归纳产品需求群体主流风格

基于目标市场与需求定位,分析该群体当前主流的视觉偏好。

规则:

- 参考使用人群的核心诉求。

### 2. 提取产品设计内涵

从核心卖点与 slogan 中提取产品的内在价值与调性。

### 3. 总结产品情绪价值

分析产品应传递的情绪氛围与心理联想。

### 4. 参考不同设计风格

结合参考案例,评估可行的设计风格方向。

规则:

- 不允许多种风格胡乱叠加导致画面繁杂。

### 5. 确定最终海报设计主要风格

综合以上分析,给出一个明确的视觉风格令牌。

规则:

- 风格必须与产品调性一致,不允许出现"为了风格而风格"。
- 电商主图风格需考虑点击率(CTR),详情页风格需考虑转化率(CVR)。

### 6. 确定色彩情绪方向

基于产品类目,按以下表格确定色彩情绪:

| 色彩情绪       | 适用类目                                            |
| -------------- | --------------------------------------------------- |
| 暖色           | 促销/食品/家居/宠物/母婴/农业                       |
| 冷色           | 科技:电脑/配件/办公/工业品/商业/定制/通信/数码/汽车 |
| 可自行选择色调 | 服饰/配饰等其余分类                                 |

## 输出格式

> **强制约束:只返回符合 outputs schema 的 JSON 对象,不要任何前后说明。**
