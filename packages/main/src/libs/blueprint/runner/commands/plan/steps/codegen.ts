/**
 * ============================================================================
 * 【P-08 · Pass3:叶子发码(代码作骨,LLM 填肉)】
 * ============================================================================
 * 生成的每个节点是一段 TS,在 vm.runInThisContext 中执行,契约:
 *  - 依赖注入,无外部 import;工具 id 已由 Pass1/2.5 固化,运行期不做检索;
 *  - 代码负责:按 metag schema 校验输入 → 调工具/在标注点把 LLM 当函数调 →
 *    按 schema 校验输出;强校验全部由代码完成;
 *  - modus tollens:校验不过(¬Q)→ 抛 PlanViolation(producerNodeId=给出该
 *    结论的 LLM 调用节点)→ 执行器沿 graphology-dag 反向边定位该节点,携带
 *    evidence 重答(≤MAX_NODE_RETRY);仍失败沿异常链上抛,顶层被平台拦截,
 *    重新导入规划器(宏观 ReAct)。
 */
import { Capability } from '$types/blueprint/capability.js';
import { PlanContext } from '../context.js';

/** 生成工作流的统一校验异常:被否结论 → 反推重答的载体 */
export class PlanViolation extends Error {
    constructor(
        readonly producerNodeId: string, // 给出被否结论的节点(LLM 调用点)
        readonly check: string,          // 违反了哪条校验
        readonly evidence: string,       // 反例/证据,回炉时注入该节点提示词
    ) {
        super(`[${producerNodeId}] ${check}: ${evidence}`);
        this.name = 'PlanViolation';
    }
}

export async function passCodegen(cap: Capability, pctx: PlanContext): Promise<void> {
    // @TODO(P-08 主体):
    // 1. 组装:cap.goal + 输入/输出 metag schema + KV_TOOLS(固化工具 id) + 需求文档;
    // 2. LLM 生成节点源码(Prism 收敛;闸门=tsc 语法检查 + vm 干跑 + schema 断言存在性);
    // 3. 落盘:cap.code = 源码,cap.name = '#code::' + 语义名;
    // 骨架期:留痕并诚实标记,不伪装完成。
    pctx.trace(cap.id, 'codegen', '@TODO 发码未实现,骨架期占位');
    cap.name = `#code::todo`;
    pctx.prjdb.upcertCapa(cap);
}