/**
 * ============================================================================
 * 目录：src/perspective —— 多视角评估层（Multi-Perspective Evaluation）
 * ============================================================================
 * 【子任务】任务书 1.3，等价 G-Eval+MoA+Self-Refine 组合：对任一 LLM 产物，拆维度→
 * 分维并发评估→受控精炼。作为高阶能力包装规划核心最易错两步(P5 拆解、P7 编译)，
 * 提升质量而不改其接口。
 *
 * 【接口】
 * - splitDimensions(artifact,kind):Promise<Dimension[]> —— 调 P1，产 ≤5 维度；
 *   代码层用 LexiconManager 去重(维度名也归一化，防近义维度重复)，超 5 截断/合并。
 * - evaluate(artifact,dims):Promise<Critique[]> —— 每维度并发跑参数化 P2(一个模板打所有
 *   维度)；并发安全(各维度独立，呼应 §2「拓扑层内可并发」)。
 * - refine(artifact,critiques):Promise<RefineResult> —— 调 P3 合并精炼。最多 1–2 轮；
 *   每轮末带「是否真的改好」二值门，未改好回退上一版(changed=false 保留原版)；
 *   产 before/after + changelog(验收 4)。
 * - withPerspective(genFn) —— 高阶包装：generate→split→evaluate→refine，返回精炼产物。
 *   供 `withPerspective(()=>decompose(...))`(P5)、`withPerspective(()=>compileToHDDL(node))`(P7)。
 *   ⚠ 泛型透明：包装前后产物类型不变，上层无感知。
 *
 * 【实现要求】
 * - 维度≤5、精炼≤2 轮、二值门、回退 —— 四条硬约束(验收 4)，做成常量+断言。
 * - 二值门判定结构化(P3 changed 字段即门信号)，不靠解析自由文本。
 * - P1/P2/P3 各埋 span；withPerspective 额外埋包裹 span 串起整个闭环(拆了哪些维度/各维打
 *   分/改了什么)，便于回放。
 * - 只做编排；提示词文本在 src/prompts，去重借 src/lexicon。
 * - 依赖：src/prompts(P1/P2/P3)、src/lexicon、src/types、src/telemetry。
 */
export { };
