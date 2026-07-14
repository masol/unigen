/**
 * ============================================================================
 * 目录：src/telemetry —— 可观测性（OpenTelemetry 埋点）
 * ============================================================================
 * 【子任务】落实 §1「历史可追溯」+ 验收 6。为每个 LLM 调用点提供统一 span，
 * 与执行器共用 OTel 端点，记录输入摘要/输出/耗时/重试次数，使调用可回放，
 * 供后续人工/AI 改进工作流（§8「改进不靠猜，靠真实运行记录」）。
 *
 * 【能力】
 * - initTelemetry(config): void —— 指向 OTLP 端点（与执行器同源）；端点缺省降级 no-op，
 *   绝不因遥测未配置阻断主流程。
 * - withSpan(name, attrs, fn): Promise<T> —— 包裹异步操作，自动记录起止/耗时/异常；
 *   返回 fn 结果。供 prompts/lexicon/solver/extract/perspective 复用。
 * - 记录属性（结构化可检索）：prompt.id、input.summary(截断)、output(摘要)、
 *   duration.ms、retry.count、outcome(ok/schema_fail/llm_error/intercepted...)。
 *
 * 【实现要求】
 * - 横切关注点：不依赖任何业务模块，只被依赖（与 types 同处底层）。
 * - 失败隔离：埋点自身异常绝不冒泡影响业务（内部 try/catch 吞掉）。
 * - 输入摘要脱敏/截断，勿把超长 artifact 原样写入 span。
 * - 依赖：@opentelemetry/*，不依赖 src 业务模块。
 */
export { };
