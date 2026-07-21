/**
 * ============================================================================
 * 【P-Pass1 · skeleton:人类流程先验检索】
 * ============================================================================
 * 检索优先级递减:
 *   1. RAG 命中 → 直接返回格式化文本
 *   2. RAG 未命中 → generateProcedure 生成步骤+中间交付物
 *
 * 可选开关 llm-pc (procedure check): 开启时对生成结果跑宽松评审循环,
 * 关注工作流质量和真实性,refeed 重画直到 PASS 或轮次耗尽。
 * 默认关闭:下游 dag 设计阶段有完整校验,前置评审非必需。
 */
import Logger from "electron-log/main.js";
import { RAG_SKELETON_LIMIT } from "../config.js";
import { PlanContext } from "../context.js";
import { globalKnowledgeDB } from "../knowledge.js";
import { generateProcedure } from "./discuss.js";

/**
 * 拉取人类处理同类任务的参考流程。
 * @param query 任务描述 或 交付物名+意图(用于子层检索)
 */
export async function fetchProcedurePrior(query: string, pctx: PlanContext): Promise<string> {
    // 1) RAG 知识库
    const hits = await globalKnowledgeDB.searchProcedure(query, RAG_SKELETON_LIMIT);
    if (hits.length > 0) {
        const text = hits.map((h, i) =>
            `### 参考流程 ${i + 1}${h.source ? `(${h.source})` : ""}\n${h.procedure}`
        ).join("\n\n");
        Logger.debug(`[skeleton] RAG+Rerank 命中人类流程先验 ${hits.length} 条`);
        return text;
    }

    // 2) LLM 生成
    const args = pctx.ctx.cmd.args || {};
    const llmPc = String(args["llm-pc"] ?? "").trim().toLowerCase();
    const runReview = llmPc === "true" || llmPc === "on";

    Logger.debug(`[skeleton] RAG 未命中,LLM 生成流程 (review=${runReview})`);
    const procedure = await generateProcedure(query, pctx, { runReview });

    Logger.info(`[skeleton] 流程生成完成 len=${procedure.length}`);
    return `### LLM 提炼的人类处理流程\n${procedure}`;
}