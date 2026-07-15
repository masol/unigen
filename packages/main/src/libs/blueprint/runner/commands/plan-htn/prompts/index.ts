/**
 * ============================================================================
 * 目录：src/prompts —— 固定提示词模板库（P1–P8）
 * ============================================================================
 * 【子任务】集中托管 8 个模板及其 zod 输出 schema，统一走 AI SDK generateObject。
 * ⚠ 硬规则(任务书0)：模板由代码固定，LLM 只产出模板参数(维度/拆解/对齐/编译/解算)，
 *   绝不让 LLM 自由生成提示词本身；全部走 zod，不接受自由文本解析；解析失败即失败。
 *
 * 【模板清单】(输入→输出 zod 要点)
 * - P1 splitDimensions  目标+artifact类型 → dimensions[]:{name,checksWhat,why}, ≤5
 * - P2 evaluateDimension artifact+单dimension → {dimension,score,issues[],fixes[]}
 *      ⚠ 一个参数化模板跑所有维度，不逐维写提示词。
 * - P3 refine           artifact+全部critique → {refinedArtifact,changed,changelog[]}
 * - P4 bootstrap        用户任务 → {initStates[],primitiveActions[]:{name,pre,eff},
 *                       targetAttributes[]}
 * - P5 decompose        target+allowedVocabulary+primitives →
 *                       {isGrounded, methods[]:{subAttributes[],ordering}}
 *                       ⚠ 必须支持多 method(OR)；兼「拦截器」：判 target 是否触底。
 * - P6 align            候选词+词表 → {decision:'reuse'|'new', matchedId?, confidence}
 * - P7 compileToHDDL    compound+子任务+拓扑序 → {task,method:{name,subtasks,ordering}}
 * - P8 simulateSolve    HDDL+initFacts+goal → {planFound,actionSequence[],assumptions[]}
 *                       ⚠ v1 折衷：让 LLM 顺不可变事实链模拟 Prolog 回溯(§6.2)。
 *
 * 【实现要求】
 * - 每模板导出函数 pX(params):Promise<ZodOut>：①固定 system/user 模板+注入 params(仅
 *   参数，不拼提示词逻辑)；②generateObject({model,schema:PXSchema});③返回校验后对象。
 * - schema 从 src/types 复用（单一事实源），不重复定义业务类型。
 * - 每调用点埋 OTel span(输入摘要/输出/耗时/重试)。模型/温度/重试集中配置,可按 P 分级。
 * - 不做编排：P5/P7 是否套 withPerspective 由上层决定，此处只提供「单发」。
 * - 依赖：ai、zod、src/types、src/telemetry。
 */
export { };
