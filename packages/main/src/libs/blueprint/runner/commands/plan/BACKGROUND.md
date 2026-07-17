# Plan 模块公共背景（每个子任务均附带本文件）

## 一、这个系统是什么

一个"一句话 → 可执行工作流"的规划器，运行于 Electron 主进程。规划产物持久化为
两张 SQLite 表（drizzle）：

- **capabilities**：能力表。每行一个能力(节点)。name=#workflow 的行,其 code 保存
  子层 DAG 定义；atomic 的行是可直接执行的叶子。整个应用本身也是一个能力(根),
  从 KV-store 固定 key 取到。整个系统 = 一个函数 = 一个 DAG 的 DAG。
- **metag**：元术语表。每行定义一个"交付物/数据接口"(fieldKey 主键 + intent +
  zod schema)。能力的 input/output 只存 fieldKey 字符串数组,含义全部查 metag。

## 二、核心方法论：分层批量展开（Layered Batch Expansion）

不做全局一次性规划(长链幻觉)，也不做逐节点逆推(成本高)。而是：

1. 对一个能力,让 LLM 一次吐出 **≤7 节点的完整子层 DAG**(节点=子能力草案,
   边=fieldKey 数据依赖)。节点可以复杂,但层内节点数受限。
2. 用 **Prism 固定棱面**收敛该层：完备性/拓扑连贯/粒度均衡/词表与能力复用/
   可切分性(上下文管控:超长输入必须声明 chunk 或插入切分节点)。
   Prism = 草稿→分棱面并发批判→合并精炼(≤2轮,changed 二值门,没改好回退)。
3. 对每个子能力做**复杂度判定**：atomic 则触底,否则入队递归展开(回到 1)。
4. 直到全部叶子 atomic → 全局校验 → 交付根能力 id。

## 三、硬规则（任何子任务不得违反）

1. **代码作骨、LLM 填充**：拓扑校验、接口闸门、深度守门、术语对齐落库、DAG
   编译一律代码实现；LLM 只产出层内容/判定/批判,绝不让 LLM 维护全局。
2. **接口硬闸门**：子层首尾接口必须与父能力 input/output 的 fieldKey 精确一致,
   不一致 → 拒绝整层,带原因回炉重生成(最多 N 次),仍失败 → 标 blocked 诚实上报。
3. **失败不删**：Prism 批判、层被拒原因、blocked 原因全部留痕(planTrace/
   blockReason),供换路与审计。
4. **术语不漂移**：fieldKey 归一化 snake_case;新词先代码相似度预筛,高相似才调
   LLM 对齐复核(比对 intent/schema 而非名字);低置信不自动合并,标 needsReview。
5. **提示词模板固定**,LLM 只填参数;输出走 NL2Format + zod(每字段写清 description)。
6. **库即黑板**：两张表+KV 是唯一真相源,无内存队列依赖;任何时刻中断,重跑入口
   即从库中 status 恢复(reconcile 模式:每轮查询"待处理"→处理→回写)。

## 四、LLM 调用机制（项目已有,直接用）

- `NL2Format({model, instructions, prompt, output: Output.object({schema})})`
  → `{ output }`(已过 zod 校验)。
- `getSmartModel(undefined, ctx)` 取模型;`ctx?.notify(title, body)` 前端提示;
  日志用 `electron-log/main.js` 的 Logger。
- 并发用 pMap。

## 五、状态机（capabilities.status）

draft(刚建,未展开) → planned(已展开子层) / atomic(触底叶子)
draft → blocked(展开失败,含原因) planned 的全部子孙 atomic 后可被校验通过。
metag.origin: source(用户素材)/derived(中间物)/final(终极交付物)。

## 六、验收总则

- 任意中断后重跑可继续;- 产出的每层是合法 DAG 且接口衔接;- 全部叶子 atomic;
- 失败时能精确说出断点/已试方案/原因;- 全程无任何一个 LLM 见过全局。
