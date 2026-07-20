/**
 * ============================================================================
 * 【P-03 · expandPass：递归拆解到最小可执行复杂度】
 * ============================================================================
 * 一次 gdag.walk 完成全部递归：walk 在访问器返回后重读 node.dag，
 * 访问器展开节点挂上子层，walk 顺势钻进新层——不需要外层 while。
 * 同层兄弟节点并行(EXPAND_CONCURRENCY 全局限流)。
 *
 * 【并行安全前提】expandOne 各实例只写"自己那个节点"的 attrs/facets；
 * 唯一的共享写点是产物注册表，已由 GDag.registerArtifact 内部串行化；
 * persist() 是同步快照，任意时刻调用都落一致状态。
 * 【并行下的池快照语义】upstreamPool 在展开开始时取快照。兄弟节点并发
 * 展开互不知晓对方的增量回写——池可能"偏旧"，只影响复用机会多少，
 * 不影响正确性(回写只加不删，已连的边不会失效)。
 *
 * 每个 pending 节点的判定链(任一命中即为可执行叶子，短路)：
 *   1. lib      有现成库/工具可直接调用？(检索为空实现，当前恒 no)
 *   2. codeable 确定性代码可直接实现？   ┐ 一次 LLM 判定
 *   3. simple   弱模型单次调用可胜任？   ┘ 输出 CODE/SIMPLE/COMPLEX
 * 三态 facet 落盘每次判定结果：重入时 'no' 直接短路，不重复调 LLM——
 * 这是选 facet 三态而非 tag 的全部意义。
 *
 * COMPLEX 的两个出口：
 *  - 深度未达上限 → makeExpandTask(输入侧开放上游数据池任选，输出侧锁死)
 *    → designDag(hooks.review 查拆解质量四维度；hooks.postCheck 做归一后
 *    边界对账) → 父节点 inputs 增量回写 → attachSubDag。
 *  - 深度达上限 → 无条件警告，但不中断：强制标记 simple 落叶，
 *    forcedNote 留痕——问题推迟到 simple 转代码时处理。
 *
 * pass 结束时的不变式：全图每个节点要么 expanded(有子层)，
 * 要么 awaiting_code(可执行叶子)——图即可执行。
 */
import { getSmartModel } from "$libs/model/index.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { PNode } from "$types/index.js";
import { DagDesignResult, Io } from "$types/shared/plan/nodes.js";
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import { EXPAND_CONCURRENCY, getExpandDepth } from "../config.js";
import { ConflictSignal, PlanContext } from "../context.js";
import {
    FacetNames, GDag, getFacet, isExecutable,
    NodeStatusValue,
    type WalkEntry,
} from "../graph/gdag.js";
import { designDag, makeExpandTask, registerLayer, ReviewFeedback } from "./dag.js";

// ─── 复杂度判定 ────────────────────────────────────────────────────────────

const COMPLEXITY_PROMPT = `你是加工节点复杂度裁判。判断一个数据加工节点能否被"一段确定性代码"
或"单次调用的轻量语言模型"直接可靠地完成。

判定基准(按序检查，命中即停)：
- CODE：加工规则完全确定(格式转换、过滤、合并、排序、统计、模板填充等)，
  不需要语义理解，可写成普通程序。
- SIMPLE：需要语义理解，但目标单一、上下文有限、无多阶段推理——
  一个轻量模型一次调用即可稳定完成(如摘要一段文本、抽取字段、单条改写、单项分类)。
- COMPLEX：包含多个可分离的子目标、多阶段加工、或需要基于中间结果继续决策。

输出单行，只允许以下三种：
CODE
SIMPLE
COMPLEX: <一句话说明主要复杂性来源，作为后续拆分的指引>
不要输出其他任何内容。`;

interface Verdict {
    kind: 'code' | 'simple' | 'complex';
    reason: string;
}

async function judgeComplexity(node: PNode, pctx: PlanContext): Promise<Verdict> {
    const io = (ios: PNode['inputs']): string =>
        ios.map(i => `- ${i.name}：${i.intent}`).join("\n");
    // 判定本身用强模型：判错(false-simple)的执行代价远高于判定成本
    const { text } = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions: COMPLEXITY_PROMPT,
        prompt: `节点：${node.name}\n意图：${node.intent}\n\n输入：\n${io(node.inputs)}\n\n输出：\n${io(node.outputs)}`,
    });
    const line = (text.trim().split("\n")[0] ?? "").trim();
    if (/^CODE\b/i.test(line)) return { kind: 'code', reason: '' };
    if (/^SIMPLE\b/i.test(line)) return { kind: 'simple', reason: '' };
    const m = line.match(/^COMPLEX[:：]?\s*(.*)$/i);
    if (m) return { kind: 'complex', reason: m[1] || '未给出理由' };
    /*
     * 无法解析按 COMPLEX 处理：false-complex 只多付一轮拆解、且被深度上限
     * 兜底；false-simple 会把复杂任务塞给弱模型，执行期才暴露，代价更高。
     */
    Logger.warn(`[expand] 复杂度判定输出无法解析，按 COMPLEX 处理：${line}`);
    return { kind: 'complex', reason: '判定输出无法解析，保守拆分' };
}

// ─── 库检索(空实现) ────────────────────────────────────────────────────────

/**
 * 现成库/工具可否直接实现该节点。
 * @todo 接入 globalToolDB 语义检索 + 能力匹配裁决。当前恒定 false。
 */
async function hasLibraryFor(_node: PNode): Promise<boolean> {
    return false;
}

// ─── 拆解质量评审(hooks.review)：三个独立评审器并行 ────────────────────────
/*
 * 【为何拆三不拆一/不拆四】多准则单调用有注意力稀释与"满足即停"问题，
 * 单准则单调用是 LLM 评审的通行做法；但拆分收益来自"心智操作不同"而非
 * 条目数——四维度按心智操作归三类：
 *   A 复杂度单调下降：子节点↔原节点【纵向对比】，重度依赖原节点上下文；
 *   B 冗余(多余产物+职责重叠)：同型操作"删掉它，方案还成立吗"，合并不串扰；
 *   C 信息断链：逐节点【局部自足性】，无需任何对比。
 * 三调用 Promise.all 并行：墙钟与单调用相当。注意这发生在 walk 信号量
 * 闸内，实际 LLM 并发上限为 EXPAND_CONCURRENCY × 3。
 *
 * 未纳入的候选维度：粒度均衡(美学非正确性)、命名规范(归一器兜底)、
 * 扇出上限(复杂度判定天然抑制)——宽松评审精神：只拦真伤。
 */

/** 各评审器共享的收尾格式约定 */
const REVIEW_OUTPUT_RULES = `这是宽松评审：只拦截确定成立的问题，拿不准的一律放过。
如果没有问题，输出单行：PASS
如果存在问题，按以下格式逐条输出：
ISSUE: [位置] [问题] [修正方向]
只输出上述格式，不要添加任何额外说明。`;

/** A · 拆解真实性：只拦"没有真正拆开"。子节点允许仍复杂——递归会继续处理 */
const REVIEW_MONOTONE_PROMPT = `你是节点拆解方案的评审器，只负责一个维度：拆解是否真正发生。
一个粒度过粗的加工节点(原节点)被拆解为一层更细的流水线蓝图。
后续流程会对仍然复杂的子节点【继续递归拆解】，因此子节点允许依然复杂，
只要其范围比原节点严格缩小。你要拦截的只是"没有真正拆开"：

只在以下情形报告问题：
- 某个子节点实质承担了原节点的全部或几乎全部工作——删除其余子节点、
  仅保留它加上少量搬运/改名/格式微调，即可等价替代原节点；
- 整个方案只是把原节点换了个说法复述一遍(名义拆分)。

以下情况【不是】问题，一律放过：
- 某子节点承担了原节点的一部分核心逻辑且自身仍然复杂——只要其范围
  明确小于原节点，递归会继续拆它；
- 各子节点分量不均，存在明显的"重节点"与"轻节点"。

${REVIEW_OUTPUT_RULES}`;

/** B · 冗余：多余产物 + 职责重叠(同型判据："删掉它，方案还成立吗") */
const REVIEW_REDUNDANCY_PROMPT = `你是节点拆解方案的评审器，只负责一个维度：方案中是否存在冗余。
一个粒度过粗的加工节点被拆解为一层更细的流水线蓝图。

用同一个判据检查两种冗余——"把它删掉，方案是否照常工作"：
1. 多余产物：是否存在某个中间产物，将它及产出它的加工从方案中移除、
   把其消费者改接上游数据后，最终交付物依然能同质量产出？
   (每个中间产物都必须是"减一即断"的必要环节。)
2. 职责重叠：是否有两个子节点对相同或基本相同的输入做本质相同的加工？
   (名称不同但干的是同一件事，删掉其一、消费者改接另一个即可。)

${REVIEW_OUTPUT_RULES}`;

/** C · 信息断链(语义类别级)：字段/粒度/覆盖范围的严格对齐属后续 schema 细化阶段 */
const REVIEW_DERIVABILITY_PROMPT = `你是节点拆解方案的评审器，只负责一个维度：语义层面的信息来源。
一个粒度过粗的加工节点被拆解为一层更细的流水线蓝图。
数据的精确结构(字段、粒度、覆盖范围、规则明细)由后续专门的 schema 细化
阶段严格对齐，【不在】本次检查范围。你只做语义层面的可行性判断：

逐个子节点检查这一点：
该子节点输出所需的信息【类别】，其声明的输入中是否存在语义上能够承载它的来源？
只要"这类信息可以从这份输入来"在语义上说得通，即视为通过。

以下情况【不是】问题，一律放过：
- 输入的说明未明确列出某个子项/字段/规则，但该输入的语义范畴合理延伸可涵盖之；
- 输入的覆盖范围可能偏窄(如"主要对象"未必含全部对象)——范围对齐是 schema 阶段的事;
- 常识与领域通识可补足的信息。

只在以下情形报告问题：
子节点的输出需要某一类别的信息，而其声明的全部输入在语义上都不可能承载
这类信息，常识也无法补足——即无论后续 schema 如何细化都注定断链。

${REVIEW_OUTPUT_RULES}`;

interface ReviewerSpec {
    /** 反馈行前缀，让回喂消息可归因到维度 */
    tag: string;
    instructions: string;
    /** 是否需要原节点上下文(纵向对比需要；局部检查给了反而稀释注意力) */
    withOriginal: boolean;
}

const EXPANSION_REVIEWERS: ReviewerSpec[] = [
    { tag: "复杂度", instructions: REVIEW_MONOTONE_PROMPT, withOriginal: true },
    { tag: "冗余", instructions: REVIEW_REDUNDANCY_PROMPT, withOriginal: false },
    { tag: "信息断链", instructions: REVIEW_DERIVABILITY_PROMPT, withOriginal: false },
];

async function reviewExpansion(
    node: PNode, blueprint: string, pctx: PlanContext,
): Promise<ReviewFeedback> {
    const io = (ios: Io[]): string =>
        ios.map(i => `- ${i.name}：${i.intent}`).join("\n");
    const original =
        `原节点：${node.name}\n意图：${node.intent}\n` +
        `原输入：\n${io(node.inputs)}\n原输出：\n${io(node.outputs)}\n\n`;

    const runOne = async (spec: ReviewerSpec): Promise<string[]> => {
        const { text } = await generateText({
            model: getSmartModel(undefined, pctx.ctx),
            instructions: spec.instructions,
            prompt: (spec.withOriginal ? original : "") + `拆解蓝图：\n${blueprint}`,
        });
        Logger.debug(`[expand] 拆解评审[${spec.tag}]「${node.name}」：`, text);
        // 与可行性评审同一精神：解析不出 ISSUE 就放行
        return text.split("\n")
            .filter(l => /^ISSUE:/i.test(l.trim()))
            .map(l => `[${spec.tag}] ${l.trim()}`);
    };

    // 按 EXPANSION_REVIEWERS 顺序解构：A 拆解真实性 / B 冗余 / C 信息断链
    const [monotone, redundancy, derivability] =
        await Promise.all(EXPANSION_REVIEWERS.map(runOne));

    /*
     * 路由规则：拆解真实性失败 = 结构骨架被否决 → redesign(弃案重画)，
     * 此时把其余维度的意见一并捎上(新方案设计时同样要规避)。
     * 仅冗余/断链问题 → patch(局部修正不动骨架)。
     */
    if (monotone.length > 0) {
        return { issues: [...monotone, ...redundancy, ...derivability], mode: 'redesign' };
    }
    return { issues: [...redundancy, ...derivability], mode: 'patch' };
}

// ─── 边界复核(hooks.postCheck 的核心)：registerLayer 归一之后以正式名对账 ──

/**
 * designDag 内的 validateNodes 已按原始名对过账；此处复核的是
 * registerArtifact 归一(Fuse+LLM)可能造成的名称漂移。
 * 输入侧对"可用全集"(原 inputs + 上游池)放行——任选语义；
 * 输出侧仍恰等对账。
 */
function checkLayerBoundary(
    gdag: GDag, layerId: string, node: PNode, availableInputs: Io[],
): string[] {
    const errs: string[] = [];
    const avail = new Set(availableInputs.map(i => i.name));
    const outputs = new Set(node.outputs.map(o => o.name));

    for (const a of gdag.initialArtifacts(layerId))
        if (!avail.has(a))
            errs.push(`子层初始数据「${a}」不在可用输入清单中(归一后名称漂移或凭空输入)`);

    const terms = new Set(gdag.terminalArtifacts(layerId));
    for (const t of terms)
        if (!outputs.has(t))
            errs.push(`子层终端产物「${t}」不在父节点 outputs 中`);
    for (const o of outputs)
        if (!terms.has(o))
            errs.push(`父节点 output「${o}」不是子层的终端产物(未产出或被子层内部消费)`);
    return errs;
}

// ─── 单节点处理(walk 访问器；同层并行执行，只写自己节点) ──────────────────

async function expandOne(e: WalkEntry, pctx: PlanContext): Promise<void> {
    const { node, depth, graphId } = e;
    const gdag = pctx.gdag;
    gdag.updateNode(node.id, { status: 'expanding' });

    // 重入短路①：任一执行途径此前已判 yes → 直接落叶
    if (isExecutable(node)) {
        gdag.updateNode(node.id, { status: 'awaiting_code' });
        pctx.persist();
        return;
    }

    // 判定 1：库(三态短路——'no' 不再重查)
    if (getFacet(node, FacetNames.lib) === 'pending') {
        if (await hasLibraryFor(node)) {
            gdag.setFacet(node.id, FacetNames.lib, 'yes');
            gdag.updateNode(node.id, { status: 'awaiting_code' });
            Logger.debug(`[expand] 「${node.name}」命中现成库，落叶`);
            pctx.persist();
            return;
        }
        gdag.setFacet(node.id, FacetNames.lib, 'no');
    }

    // 判定 2+3：codeable / simple(一次 LLM 判定；重入短路②：双 'no' 免判)
    let verdict: Verdict;
    if (getFacet(node, FacetNames.simple) === 'no'
        && getFacet(node, FacetNames.codeable) === 'no') {
        verdict = { kind: 'complex', reason: '此前已判定为复杂(重入短路)' };
    } else {
        verdict = await judgeComplexity(node, pctx);
        gdag.setFacet(node.id, FacetNames.codeable, verdict.kind === 'code' ? 'yes' : 'no');
        gdag.setFacet(node.id, FacetNames.simple, verdict.kind === 'simple' ? 'yes' : 'no');
    }

    if (verdict.kind === 'code' || verdict.kind === 'simple') {
        gdag.updateNode(node.id, { status: 'awaiting_code' });
        Logger.debug(`[expand] 「${node.name}」判定 ${verdict.kind.toUpperCase()}，落叶`);
        pctx.persist();
        return;
    }

    // COMPLEX + 深度达上限：无条件警告但不中断——强制落叶，问题推迟到转代码时处理
    const maxDepth = getExpandDepth(pctx.ctx.cmd.args ?? {})
    if (depth >= maxDepth) {
        const warning =
            `[expand] 节点「${node.name}」在深度 ${depth} 达到展开上限 ${maxDepth} ` +
            `仍判定为复杂(${verdict.reason})。强制按 simple 落叶，转代码时需特殊对待。`;
        Logger.warn(warning);
        pctx.notify("plan/expand", warning);
        gdag.setFacet(node.id, FacetNames.simple, 'yes'); // 覆盖判定；真实判定被 forcedNote 揭穿
        gdag.updateNode(node.id, {
            status: 'awaiting_code',
            forcedNote: `深度熔断强制落叶：${verdict.reason}`,
        });
        pctx.persist();
        return;
    }

    // ── COMPLEX：展开为子层 ────────────────────────────────────────────────

    // 上游数据池(同层祖先产物 + 本层初始数据，代码遍历收集)：
    // 开放给子层任选，避免子层重算上游已产出的数据
    const pool = gdag.upstreamPool(graphId, node.id);
    Logger.debug(`[expand] 「${node.name}」(深度 ${depth}) 判复杂，展开：${verdict.reason}` +
        `；上游池 ${pool.length} 项`);

    const task = makeExpandTask(node, pool, { complexityReason: verdict.reason });
    let layerId: string | null = null;

    await designDag(task, pctx, {
        // 定制维度评审(蓝图原文)：复杂度单调/产物必要/职责不重叠/信息可导出
        review: (blueprint) => reviewExpansion(node, blueprint, pctx),

        // 后置检查(结构化结果)：归一登记 → 按正式名边界对账，失败回滚子层
        postCheck: async (result: DagDesignResult): Promise<string[]> => {
            const lid = await registerLayer(result, pctx, false);
            const errs = checkLayerBoundary(pctx.gdag, lid, node, task.boundary!.availableInputs);
            if (errs.length > 0) {
                pctx.gdag.dropGraph(lid); // 回滚本轮子层(注册表别名不回滚，追加式留痕)
                return [
                    ...errs,
                    // LLM 看不见归一器，反馈必须给它能执行的动作
                    `与可用输入/交付物本质相同的数据，必须直接使用其清单名称；` +
                    `新的中间产物请使用与清单名称显著不同的命名，避免被系统归并为同一份数据。`,
                ];
            }
            layerId = lid;
            return [];
        },
    });

    /*
     * 增量回写：子层实际选用的池内数据若超出节点原 inputs，父节点 inputs
     * 已过时——补录并重连本层的边(只加不删；新输入源自同层祖先/初始数据，
     * 重连必不成环)。然后才挂子图。
     */
    const usedInitials = pctx.gdag.getGraph(layerId!)
        ? pctx.gdag.initialArtifacts(layerId!) : [];
    const have = new Set(node.inputs.map(i => i.name));
    const extra = pool.filter(io => usedInitials.includes(io.name) && !have.has(io.name));
    if (extra.length > 0) {
        pctx.gdag.addNodeInputs(graphId, node.id, extra);
    }

    pctx.gdag.attachSubDag(node.id, layerId!); // status → expanded
    pctx.persist();
    // walk 重读 node.dag 后自动钻进新层，子节点在同一次遍历中继续递归
}

// ─── pass 入口 ─────────────────────────────────────────────────────────────

export async function expandPass(pctx: PlanContext): Promise<void> {
    const gdag = pctx.gdag;
    if (!gdag.rootId || !gdag.getGraph(gdag.rootId)) {
        throwUnprcessable(`[expand] 根层不存在，designTop 未完成`, true);
    }

    // 崩溃/中断恢复：上轮遗留的 expanding 一律回退 pending(判定结果在 facets 里，不丢)
    for (const { node } of gdag.scan(NodeStatusValue.expanding)) {
        gdag.updateNode(node.id, { status: 'pending' });
    }

    try {
        await gdag.walk(
            async (e) => { await expandOne(e, pctx); },
            {
                filter: (n) => n.status === 'pending', // 同层筛选：已处理节点只借道下潜，不重访
                concurrency: EXPAND_CONCURRENCY,
            },
        );
    } catch (err) {
        /*
         * 并行分支多处失败时 walk 抛 AggregateError(全部分支已落定，
         * 无脱缰任务)。优先重抛 ConflictSignal 保住外层重入语义——
         * 当前 expand 自身不产 ConflictSignal，此分支为未来 pass 预留。
         */
        if (err instanceof AggregateError) {
            Logger.error(`[expand] 并行分支 ${err.errors.length} 处失败`);
            const conflict = err.errors.find(x => x instanceof ConflictSignal);
            throw conflict ?? err.errors[0];
        }
        throw err;
    }

    // 不变式核验：全图应无 pending/conflict，节点非 expanded 即 awaiting_code
    const leftovers = [...gdag.scan('pending'), ...gdag.scan(NodeStatusValue.conflict)];
    if (leftovers.length > 0) {
        throwUnprcessable(
            `[expand] 遍历结束仍有未落定节点：` +
            leftovers.map(l => `「${l.node.name}」(${l.node.status})`).join("、"), true);
    }

    pctx.persist();
    Logger.debug(`[expand] 完成：叶子 ${gdag.scan(NodeStatusValue.awaiting_code).length} 个，` +
        `展开节点 ${gdag.scan(NodeStatusValue.expanded).length} 个`);
}