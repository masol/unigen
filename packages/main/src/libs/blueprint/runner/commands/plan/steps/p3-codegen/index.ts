/**
 * P-Pass3 · codeGen：节点代码生成
 *   - 并行处理所有 awaiting_code 节点（Promise.allSettled）
 *   - 每节点：planNode(规则+轻量LLM) + promptGen + codeGen + compile(reAct)
 *   - 编译通过即合格（沙箱执行留作未来拓展）
 *   - 单节点失败标记 conflict，不阻塞其他节点状态写入；整体任一失败最终抛出
 *   - 落盘：代码 + 提示词写入 kv（提示词供运行时动态加载）
 */

import type { PNode } from "$types/index.js";
import Logger from "electron-log/main.js";
import type { GeneratedArtifact, PlanContext } from "../../context.js";
import { NodeStatusValue } from "../../graph/gdag.js";
import { generateForNode } from "./pipeline.js";

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
 * 落盘（当前为空实现，留作扩展）。
 *
 * 约定的 kv 键（供运行时动态加载）：
 *   - 代码：           `.${nodeId}_code`
 *   - 第 N 步提示词：   `.${nodeId}_step${N}_system` / `.${nodeId}_step${N}_user`
 *
 * @TODO 接入 pctx.prjdb / glossary.set 落盘。当前仅缓存到内存 + 日志。
 */
function persistArtifact(art: GeneratedArtifact, pctx: PlanContext): void {
    // 内存缓存，供 flatten / 后续阶段读取
    pctx.setGeneratedCode(art.nodeId, art);

    // @TODO 实际落盘：
    // pctx.prjdb.set(`.${art.nodeId}_code`, art.code);
    // art.prompts.forEach((p, i) => {
    //     const step = i + 1;
    //     pctx.prjdb.set(`.${art.nodeId}_step${step}_system`, p.system);
    //     pctx.prjdb.set(`.${art.nodeId}_step${step}_user`, p.user);
    // });

    Logger.debug(`[codegen] (占位落盘)「${art.nodeId}」code=${art.code.length}c prompts=${art.prompts.length}`);
    Logger.debug(JSON.stringify(art, null, 2));
}

export async function codeGenForNode(node: PNode, pctx: PlanContext): Promise<void> {
    const artifact = await generateForNode(node, pctx);
    persistArtifact(artifact, pctx);
}

const DEBUG = true;

export async function codeGen(pctx: PlanContext): Promise<void> {
    const gdag = pctx.gdag;
    const targets = gdag.scan(NodeStatusValue.awaiting_code);
    if (targets.length === 0) {
        Logger.debug("[codegen] 无待生成节点，跳过");
        return;
    }

    Logger.debug(`[codegen] 开始生成，共 ${targets.length} 个节点`);

    const realTargets = DEBUG && targets.length > 0 ? [targets[0]] : targets;

    // Promise.allSettled：单节点失败不阻塞其他节点状态写入
    const settled = await Promise.allSettled(
        realTargets.map(async ({ node }) => {
            try {
                Logger.debug("generate for node")
                Logger.debug(JSON.stringify(node, null, 2))
                await codeGenForNode(node, pctx);
                if (!DEBUG) {
                    gdag.updateNode(node.id, { status: 'done' });
                }
                return node.id;
            } catch (err) {
                if (err instanceof CodeGenFailure) {
                    if (!DEBUG) {
                        gdag.updateNode(node.id, { status: 'conflict', error: err.reason });
                    }
                    Logger.error(`[codegen]「${node.name}」失败：${err.reason}`);
                }
                throw err;
            }
        }),
    );

    const failures = settled.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    if (failures.length > 0) {
        const first = failures[0].reason;
        pctx.persist();
        if (first instanceof CodeGenFailure) throw first;
        throw new AggregateError(
            failures.map(f => f.reason),
            `[codegen] ${failures.length}/${realTargets.length} 节点失败`,
        );
    }

    pctx.persist();
    Logger.debug(`[codegen] 完成：${realTargets.length} 个节点`);
}