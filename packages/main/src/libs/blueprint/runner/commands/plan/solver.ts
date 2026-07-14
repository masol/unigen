/**
 * ============================================================================
 * 目录：src/solver —— 解算层（v1 LLM 模拟 / v2 Prolog）
 * ============================================================================
 * 【子任务】落实 §6。从 HDDL 域+初始事实找出一条 grounded 原子动作序列。两阶段推进，
 * 接口一次锚定、实现分代替换：
 *   v1(§6.2)：simulateSolve —— P8 让 LLM 顺不可变事实链模拟 Prolog 回溯，占位替身。
 *   v2(§6.3)：接 SWI-Prolog，HDDL→Horn 子句，SLD 归结+tabling+时序事实链。
 * ⚠ 核心契约(验收 5)：simulateSolve 与 v2 输入输出完全一致(SolveInput→SolveResult)，
 *   替换 v2 时 planner 不改一行。对外只暴露 solve(input):Promise<SolveResult>，内部按开关路由。
 *
 * 【v1 simulateSolve(本次实现)】
 * - 调 P8：HDDL+initFacts+goal → {planFound,actionSequence[],assumptions[]}。
 * - 能验证(§6.2)：词表对齐是否稳定、结构是否合法(可拓扑排序)、管道是否连通。
 * - 不能保证：LLM 模拟无符号刚性约束，深层回溯仍可能幻觉，正确性不保证。
 *   → SolveResult 保留 assumptions[]，把 LLM 隐含假设显式化供人工审阅。
 *
 * 【v2 Prolog(留接口,本次不实现,仅占位)】
 * - 映射(§6.1)：compound→Goal；method→Horn 子句；同名多子句=OR；子句体合取=AND+顺序；
 *   primitive→带前置/效果事实；参数传递=合一。
 * - 时序事实链(§6.3)：谓词带时间步，at(car,shanghai,t0)→动作→追加 at(car,beijing,t1)，
 *   只追加不改写，回溯无需撤销。
 * - tabling(§6.1)：记忆化子目标，合法递归终止、避免重复推导。
 * - 边界(§6.1)：默认满足性搜索(找到即返回)非最优代价搜索；最优性 v2+ 再谈。
 * - 预留 PrologSolver 实现槽，与 v1 共用 solve 签名；v1→v2 仅切路由开关。
 *
 * 【实现要求】
 * - solve() 埋 span(输入摘要/planFound/动作数/耗时/后端)。
 * - 后端选择配置常量 SOLVER_BACKEND='sim'|'prolog'，默认 'sim'。
 * - 依赖：src/prompts(P8)、src/types、src/telemetry；v2 另依赖 Prolog 运行时。
 */
/**
 * 解算层（§6）。v1: simulateSolve(P8)。v2: Prolog（同 solve 签名，切 SOLVER_BACKEND 即可）。
 */
import { llmSimulateSolve } from './llm.js';
import type { SolveInput, SolveResult } from './types.js';

const SOLVER_BACKEND: 'sim' | 'prolog' = 'sim';

export async function solve(input: SolveInput): Promise<SolveResult> {
    if (SOLVER_BACKEND === 'sim') {
        const r = await llmSimulateSolve(input.goal, input.hddl.tasks);
        return { planFound: r.planFound, actionSequence: r.actionSequence, assumptions: r.assumptions };
    }
    throw new Error('prolog backend: v2 未实现'); // 留槽，接口不变
}