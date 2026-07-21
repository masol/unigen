/**
 * ============================================================================
 * 【P-Pass3 · codeGen:代码生成（占位 + 并行调度骨架）】
 * ============================================================================
 * 当前实现：
 *   - 并行找出所有 awaiting_code 节点
 *   - 对每个节点调用 codeGenForNode 占位函数
 *   - 失败抛 CodeGenFailure，供未来接入 reAct
 *
 * 未来实现要点（@TODO）：
 *   1. 单节点内 reAct：生成 → 编译 → 测试 → 重试
 *   2. 失败归因：抛 CodeGenFailure { nodeId, reason, suggestion }
 *   3. 上层处理：捕获失败 → 强制展开该节点（回到 P2 logicalExpand）
 *   4. 代码沙箱：安全执行用户生成代码的隔离机制
 */
import { PNode } from "$types/index.js";
import Logger from "electron-log/main.js";
import { PlanContext } from "../../context.js";
import { NodeStatusValue } from "../../graph/gdag.js";

/**
 * 代码生成失败信号（未来实现抛出）
 */
export class CodeGenFailure extends Error {
    constructor(
        readonly nodeId: string,
        readonly reason: string,
        readonly suggestion: string,
    ) {
        super(`[codegen]「${nodeId}」失败：${reason}`);
        this.name = 'CodeGenFailure';
    }
}

/**
 * 单节点代码生成（占位）
 *
 * @param node 当前节点（含 name/intent/inputs/outputs 等元信息）
 * @param pctx 全局上下文（用于访问上游产物、工具、模型等）
 * @returns void 成功 / 抛 CodeGenFailure 失败
 *
 * 未来实现要点：
 *   1. 根据 node.kind 选择代码模板
 *   2. 注入 node.intent 作为自然语言规范
 *   3. 调用 LLM 生成 TypeScript 代码
 *   4. 编译 + 单元测试验证
 *   5. 失败时归因到具体错误（语法/逻辑/超时/边界）
 */
export async function codeGenForNode(node: PNode, _pctx: PlanContext): Promise<void> {
    // 占位实现：仅记录意图，不生成代码
    Logger.debug(`[codegen] (占位) 节点「${node.name}」kind=${node.kind} 应生成代码`);
    Logger.debug(`[codegen] (占位) 意图：${node.intent.slice(0, 80)}...`);
    Logger.debug(`[codegen] (占位) 输入：${node.inputs.map(i => i.name).join(", ")}`);
    Logger.debug(`[codegen] (占位) 输出：${node.outputs.map(o => o.name).join(", ")}`);

    // 未来这里会：
    // 1. 调用 LLM 生成代码
    // 2. 执行代码并验证
    // 3. 失败抛 CodeGenFailure
}

/**
 * 并行调度所有 awaiting_code 节点的代码生成
 *
 * 并行策略：
 *   - 使用 GDag.walk 的并发能力，按层拓扑顺序遍历
 *   - 每层内并行，但层间串行（依赖关系）
 *   - 任一节点失败立即停止（失败冒泡到 runCmd）
 */
export async function codeGen(pctx: PlanContext): Promise<void> {
    const gdag = pctx.gdag;

    // 收集全部待生成节点
    const targets = gdag.scan(NodeStatusValue.awaiting_code);
    if (targets.length === 0) {
        Logger.debug("[codegen] 无待生成节点，跳过");
        return;
    }

    Logger.debug(`[codegen] 开始生成，共 ${targets.length} 个节点`);

    // 并行调用占位函数
    // 注：此处不依赖层拓扑（每个节点独立），实际代码生成阶段会处理依赖
    await Promise.all(
        targets.map(async ({ node }) => {
            try {
                await codeGenForNode(node, pctx);
                // 成功后更新状态
                gdag.updateNode(node.id, { status: 'done' });
            } catch (err) {
                if (err instanceof CodeGenFailure) {
                    gdag.updateNode(node.id, {
                        status: 'conflict',
                        error: err.reason,
                    });
                    Logger.error(`[codegen] 节点「${node.name}」失败：${err.reason}`);
                    throw err;
                }
                throw err;
            }
        }),
    );

    pctx.persist();
    Logger.debug(`[codegen] 完成：${targets.length} 个节点`);
}