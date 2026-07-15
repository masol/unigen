/**
 * ============================================================================
 * 目录：src/history —— 历史工作流接入（Prior Workflows / 预留接口）
 * ============================================================================
 * 【子任务】§1、§8：同一份工作流后续可交 AI 基于历史表现优化；执行历史(OTel 采集)是
 * 人工/AI 改进依据。**v1 暂不实现具体逻辑，只固定接口与数据形状**，让 planner 起步时能
 * 「参考历史图/方法」而无需现在落地存储与检索。留接口、不留耦合。
 * ⚠ 范围：占位+契约。v1 默认返回「无历史」(空)，使「有/无历史」走同一代码路径，
 *   将来接真实历史库时上层零改动。
 *
 * 【预留接口(v1 给签名+no-op 默认实现)】
 * - loadPriorWorkflows(goal|signature):Promise<PriorWorkflow[]> —— 按目标/签名检索历史
 *   工作流(图+方法+执行表现)。v1 默认返回 []。
 * - PriorWorkflow = {id, createdAt, goalSignature(归一化签名), graphSnapshot(序列化 AND-OR
 *   图), methodStats?(各 method 历史成功率/代价,供 v2+ 择优), telemetryRef?(OTel trace 引用)}
 * - suggestSeed(prior):Partial<BootstrapResult>|null —— 历史图转 bootstrap 种子，v1 返回 null。
 *
 * 【与其他模块关系(现在只连线,不通电)】
 * - planner 起步可选调 loadPriorWorkflows；拿到 [] 就走全新构图(v1 现状)。
 * - 未来复用历史 method 仍要过 src/lexicon 对齐、src/graph 环/递归校验，历史非免检通道。
 * - 数据来源最终对接 §1 OTel 留存 + §7.2 状态快照分段边界。
 *
 * 【实现要求】
 * - v1 只需：上述签名 + 返回空/null 默认实现 + 数据类型。
 * - 不引入真实存储依赖，不阻塞主流程。注释写清「v2 接真实历史库」接入点。
 * - 依赖：src/types；(未来)OTel 查询后端。
 */
// 历史工作流接入（§1/§8）。v1 留接口 + no-op，让「有/无历史」走同一路径。
import type { BootstrapResult } from './types.js';
export interface PriorWorkflow { id: string; goalSignature: string; graphSnapshot: unknown; }
export async function loadPriorWorkflows(_goal: string): Promise<PriorWorkflow[]> { return []; } // v2 接真实历史库
export function suggestSeed(_p: PriorWorkflow): Partial<BootstrapResult> | null { return null; }
