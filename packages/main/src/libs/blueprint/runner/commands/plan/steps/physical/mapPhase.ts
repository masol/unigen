/**
 * ============================================================================
 * 【physical · mapPhase:map-reduce 标注 + chunk 数据分流】
 * ============================================================================
 * 核心逻辑:
 *   1. 识别产出 large/unbounded 且输入也 large/unbounded 的节点 → 标 map
 *   2. 产出 chunk 数据(D__chunk)注册进产物表
 *   3. 扫描下游消费者,LLM 判定能否逐块处理:
 *      - 能 → 改消费 chunk,标 propagate
 *      - 不能 → 前置"目标导向压缩"节点,按消费者需求把 chunks 压缩为精简版
 *   4. 如果最终交付物需要完整版 → 在终端前插 reduce 节点
 *
 * 压缩节点:类似摘要,但目标导向——由下游节点的 intent 决定压缩维度。
 * 例:"下游需要综合趋势" → 压缩节点从 chunks 提取趋势摘要。
 */
import { getSmartModel } from "$libs/model/index.js";
import { Artifact, ParallelMeta, PNode } from "$types/shared/plan/nodes.js";
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import { PlanContext } from "../../context.js";
import { FacetNames, getFacet } from "../../graph/gdag.js";
import { isLargeSize, scanLeaves } from "./scan.js";

// ─── LLM 判定:能否逐块处理 ────────────────────────────────────────────────

const CAN_CHUNK_PROMPT = `判断一个人类思维环节能否对数据的"分块版本"逐块独立处理。

原数据:「{dataName}」—— {dataIntent}
分块版本:「{chunkName}」—— 原数据的一个独立片段(一条/一段/一篇)
思维环节:「{nodeName}」—— {nodeIntent}

判断:人类做这步时,能否"看一块、处理一块、产出一块"(各块互不依赖)?
还是必须"看完全部"才能产出(需要跨块对比/综合/排名/全局统计)?

输出单行:
CAN —— 逐块独立处理
NEED_GLOBAL: <这步需要全局视角的原因,一句话> —— 必须看完全部
不要输出其他内容。`;

interface ChunkVerdict {
    canChunk: boolean;
    reason: string;
}

async function judgeCanChunk(
    dataName: string, dataIntent: string, chunkName: string,
    node: PNode, pctx: PlanContext,
): Promise<ChunkVerdict> {
    const { text } = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions: CAN_CHUNK_PROMPT
            .replace('{dataName}', dataName)
            .replace('{dataIntent}', dataIntent)
            .replace('{chunkName}', chunkName)
            .replace('{nodeName}', node.name)
            .replace('{nodeIntent}', node.intent),
        prompt: `请判断。`,
    });
    const line = text.trim();
    if (/^CAN\b/i.test(line)) return { canChunk: true, reason: '' };
    const m = line.match(/^NEED_GLOBAL[:：]?\s*(.*)$/i);
    if (m) return { canChunk: false, reason: m[1] || '需要全局视角' };
    // 判不清按需要全局(保守:前置压缩节点总归安全)
    Logger.warn(`[mapPhase] chunk 判定无法解析,按 NEED_GLOBAL:${line}`);
    return { canChunk: false, reason: '判定无法解析,保守处理' };
}

// ─── LLM 判定:目标导向压缩的维度 ──────────────────────────────────────────

const COMPRESS_DIM_PROMPT = `一个人类思维环节需要"全局视角"来处理一份大数据,但该数据太大无法完整输入。
你需要确定:从这份大数据中,按什么维度压缩/提炼,才能满足这步思维的需求?

思维环节:「{nodeName}」
人类在做什么:{nodeIntent}
大数据:「{dataName}」—— {dataIntent}

输出一句话:描述压缩维度/提炼方向(例:"提取每块的情感倾向与关键论点"、"统计每块的类别分布与异常项")。
只输出这一句话,不要其他内容。`;

async function judgeCompressDimension(
    dataName: string, dataIntent: string,
    node: PNode, pctx: PlanContext,
): Promise<string> {
    const { text } = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions: COMPRESS_DIM_PROMPT
            .replace('{nodeName}', node.name)
            .replace('{nodeIntent}', node.intent)
            .replace('{dataName}', dataName)
            .replace('{dataIntent}', dataIntent),
        prompt: `请给出压缩维度。`,
    });
    return text.trim();
}

// ─── 构造辅助 ──────────────────────────────────────────────────────────────

function makeArtifact(name: string, intent: string): Artifact {
    return { name, intent, qualityCriteria: [], sizeEstimate: 'small' };
}

function makeChunkArtifact(originalName: string, _originalIntent: string): Artifact {
    return {
        name: `${originalName}__chunk`,
        intent: `「${originalName}」的独立分块(每块可独立处理)`,
        qualityCriteria: [],
        sizeEstimate: 'small', // 每个 chunk 是 small
    };
}

// ─── 主逻辑 ────────────────────────────────────────────────────────────────

export async function mapPhase(pctx: PlanContext): Promise<number> {
    const gdag = pctx.gdag;
    const leaves = scanLeaves(pctx);
    let actions = 0;

    // 找产出 large/unbounded 且输入也 large/unbounded 的节点
    const mapCandidates = leaves.filter(l =>
        isLargeSize(l.outputSize) && l.hasLargeInput && !l.node.parallel);

    for (const cand of mapCandidates) {
        const { node, graphId, largestInputName } = cand;
        if (!largestInputName) continue;
        // 确定性节点不走 map-reduce(代码自己处理流式)
        if (getFacet(node, FacetNames.codeable) === 'yes') continue;

        const groupId = crypto.randomUUID();
        const outputName = node.outputs[0].name;
        const outputIntent = node.outputs[0].intent;
        const chunkName = `${outputName}__chunk`;
        const chunkArtifact = makeChunkArtifact(outputName, outputIntent);

        // 注册 chunk 产物
        await gdag.registerArtifact(chunkArtifact, pctx.ctx);

        // 标注本节点为 map
        const parallel: ParallelMeta = {
            onInput: largestInputName,
            groupId,
            role: 'map',
            chunkOutput: chunkName,
        };
        gdag.updateNode(node.id, { parallel });

        // 在图中:本节点的输出从 outputName 改为 chunkName
        // (原输出是语义上的"完整版",map 后产出的是 chunk 版)
        gdag.replaceNodeOutput(graphId, node.id, outputName, chunkArtifact);
        actions++;

        // 扫描下游消费 outputName 的节点
        const consumers = gdag.findConsumers(graphId, outputName);
        for (const consumer of consumers) {
            const verdict = await judgeCanChunk(
                outputName, outputIntent, chunkName, consumer, pctx);

            if (verdict.canChunk) {
                // 能逐块处理:改消费 chunk,标 propagate
                gdag.replaceNodeInput(graphId, consumer.id, outputName, chunkArtifact);
                gdag.updateNode(consumer.id, {
                    parallel: { onInput: chunkName, groupId, role: 'propagate' },
                });
                actions++;
                Logger.debug(`[mapPhase]「${consumer.name}」可逐块处理,改消费 chunk`);
            } else {
                // 不能:前置目标导向压缩节点
                const dim = await judgeCompressDimension(
                    outputName, outputIntent, consumer, pctx);
                const compressedName = `${outputName}__for_${consumer.name}`;
                const compressedArtifact = makeArtifact(
                    compressedName,
                    `针对「${consumer.name}」需求,从「${outputName}」各分块提炼:${dim}`);
                await gdag.registerArtifact(compressedArtifact, pctx.ctx);

                const compressNode: PNode = {
                    id: crypto.randomUUID(),
                    name: `压缩-${outputName}-为-${consumer.name}`,
                    kind: 'compress',
                    intent: `从「${chunkName}」各分块中提炼:${dim},产出精简版「${compressedName}」供后续使用`,
                    inputs: [chunkArtifact],
                    outputs: [compressedArtifact],
                    status: 'awaiting_code',
                    dag: null, error: null,
                    facets: {},
                    synthetic: true,
                    parallel: { onInput: chunkName, groupId, role: 'reduce' },
                };

                // 在 consumer 之前插入 compress 节点
                gdag.insertNodeBetween(graphId, node.id, consumer.id, compressNode);
                // consumer 改消费压缩后的数据
                gdag.replaceNodeInput(graphId, consumer.id, outputName, compressedArtifact);
                actions++;
                Logger.debug(
                    `[mapPhase]「${consumer.name}」需全局视角,前置压缩(${dim})`);
            }
        }

        // 如果最终交付物(终端)需要完整版——在终端前插 reduce
        const terminals = gdag.terminalArtifacts(graphId);
        if (terminals.includes(outputName)) {
            // 需要一个 reduce 节点把 chunks 合回完整版
            const fullArtifact = makeArtifact(outputName, outputIntent);
            fullArtifact.sizeEstimate = 'large';
            const reduceNode: PNode = {
                id: crypto.randomUUID(),
                name: `合并-${outputName}`,
                kind: 'reduce',
                intent: `将「${chunkName}」的所有分块合并为完整「${outputName}」`,
                inputs: [chunkArtifact],
                outputs: [fullArtifact],
                status: 'awaiting_code',
                dag: null, error: null,
                facets: { codeable: 'yes' },
                synthetic: true,
                parallel: { onInput: chunkName, groupId, role: 'reduce' },
            };
            gdag.appendTerminalNode(graphId, reduceNode);
            actions++;
            Logger.debug(`[mapPhase] 终端需完整「${outputName}」,插入 reduce`);
        }

        pctx.persist();
    }

    return actions;
}