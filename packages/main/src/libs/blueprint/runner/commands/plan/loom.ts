/**
 * Loom：图黑板上的逆向交付物规划（见 docs/loom.md）。
 * 主循环 = 查询-处理-回写(reconcile)：每轮从图中选 pending 节点处理并回写，
 * 图为唯一真相源，无独立队列；每轮 persist，断点续跑免费。
 * 没有任何一个 LLM 见过全局——全局解在黑板上涌现。
 */
import { getSmartModel } from "$libs/model/balancer/get-smart-model.js";
import { NL2Format } from "$libs/model/llm/outline.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { Output } from "ai";
import Logger from "electron-log/main.js";
import { Blackboard, diceSim, normalizeId } from "./blackboard.js";
import {
    ALIGN_SYSTEM, alignUser,
    ANCHOR_SYSTEM, anchorUser,
    REROUTE_SYSTEM, rerouteUser,
} from "./prompts/index.js";
import { AlignSchema, AnchorSchema, RerouteSchema, type Decompose } from "./prompts/schemas.js";
import { decomposeStep } from "./step.js";

/* ---------------- 配置 ---------------- */
const MAX_DEPTH = 12;          // 祖先链深度上限（递归守门）
const MAX_REPEAT = 2;          // 同一 artifact 在链上重复上限
const MAX_ITERATIONS = 60;     // 主循环轮次熔断
const MAX_REROUTE_PER_NODE = 2;// 单节点换路次数上限
const PRESCREEN_THRESHOLD = 0.62; // 预筛相似度：高于此才触发 X3
const ALIGN_CONF_THRESHOLD = 0.75;// X3 置信度：低于此不自动合并

export interface LoomOptions {
    /** 持久化回调：每轮把整图落盘。恢复用 resumeFrom。 */
    persist?: (snapshot: unknown) => Promise<void> | void;
    resumeFrom?: unknown;
}

export type LoomResult =
    | { ok: true; blueprint: ReturnType<Blackboard["compile"]>; board: Blackboard }
    | { ok: false; report: ReturnType<Blackboard["report"]>; board: Blackboard };

export async function loom(
    goal: string,
    sourceMaterials: string,
    ctx?: IRunnerContext,
    opts?: LoomOptions,
): Promise<LoomResult> {
    const tag = "[loom]";
    let board: Blackboard;
    let finalId: string;
    const rerouteCount = new Map<string, number>();

    /* ---------- 初始化 或 从持久化恢复 ---------- */
    if (opts?.resumeFrom) {
        board = Blackboard.from(opts.resumeFrom);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        finalId = (opts.resumeFrom as any).attributes?.finalId
            ?? board.g.getAttribute("finalId");
        Logger.info(`${tag} 从持久化恢复, final=${finalId}`);
    } else {
        // ▶ LLM【X1 目标锚定】获取: { is_plannable, final, sources[] }
        const anchor = await NL2Format({
            model: getSmartModel(undefined, ctx),
            instructions: ANCHOR_SYSTEM,
            prompt: anchorUser(goal, sourceMaterials),
            output: Output.object({ schema: AnchorSchema }),
        });
        Logger.debug(`${tag} anchor:\n${JSON.stringify(anchor.output, null, 2)}`);
        ctx?.notify("目标锚定", JSON.stringify(anchor.output, null, 2));

        if (!anchor.output.is_plannable) {
            throw new Error(`目标不可规划: ${anchor.output.reason}`);
        }

        board = new Blackboard();
        finalId = board.addArtifact(normalizeId(anchor.output.final.name), {
            modality: anchor.output.final.modality,
            definition: anchor.output.final.definition,
            status: "pending",
        });
        for (const s of anchor.output.sources) {
            board.addArtifact(normalizeId(s.name), {
                modality: s.modality,
                definition: s.definition,
                status: "source",
            });
        }
        board.g.setAttribute("finalId", finalId); // final 也进图，恢复时不依赖外部状态
        Logger.info(`${tag} 锚定完成 final=${finalId}, sources=${board.sourcesSummary()}`);
    }

    const persist = async () => { await opts?.persist?.(board.export()); };
    await persist();

    /* ---------- 主循环：查询-处理-回写（reconcile） ---------- */
    for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
        // —— 终局判定（先判再选，保证及时退出）——
        const finalStatus = board.artifact(finalId)!.status;
        if (finalStatus === "derivable" || finalStatus === "source") {
            Logger.info(`${tag} 成功收敛, iter=${iter}`);
            return { ok: true, blueprint: board.compile(finalId), board };
        }
        if (finalStatus === "blocked") {
            Logger.warn(`${tag} 诚实失败: final 已阻塞`);
            return { ok: false, report: board.report(finalId), board };
        }

        // —— 选取：图查询代替队列。浅层优先（距 final 近的先拆，先粗后细）——
        const pendings = board.artifacts((a) => a.status === "pending");
        if (pendings.length === 0) {
            // 无 pending 但 final 未达终态 → 只能是阻塞未传播，传播后继续
            const needReroute = board.propagateBlocked();
            if (needReroute.length === 0) {
                // 图静止且无路可走：兜底判 final blocked，出报告
                board.setArtifactStatus(finalId, "blocked", "no_pending_no_reroute");
                continue;
            }
            // 有待换路节点，进入换路（下方统一处理）
            await handleReroutes(needReroute);
            await persist();
            continue;
        }
        const t = pendings
            .map((p) => ({ ...p, depth: board.ancestorChain(p.id, finalId).length }))
            .sort((a, b) => a.depth - b.depth)[0];

        // —— 守门（纯代码，先于一切 LLM 调用）——
        const chain = board.ancestorChain(t.id, finalId);
        const abuse = board.isRecursionAbuse(chain, MAX_DEPTH, MAX_REPEAT);
        if (abuse) {
            Logger.warn(`${tag} 递归守门拦截 ${t.id}: ${abuse}`);
            board.setArtifactStatus(t.id, "blocked", `recursion_abuse:${abuse}`);
            board.propagateBlocked();
            await persist();
            continue;
        }

        // —— 单步拆解（唯一的重 LLM 环节，Prism 固定棱面包裹）——
        // ▶ LLM【X2 拆解 + S2'×4 批判 + S3 精炼】获取: { is_grounded, methods[] }
        const dec = await decomposeStep(
            { id: t.id, modality: t.attrs.modality, definition: t.attrs.definition },
            board.registrySummary(),
            board.sourcesSummary(),
            ctx,
        );

        if (dec.is_grounded) {
            board.setArtifactStatus(t.id, "derivable");
            Logger.info(`${tag} ${t.id} 触底 (from: ${dec.grounded_from.join(", ")})`);
            board.backfill(); // 可能级联闭合祖先
            await persist();
            continue;
        }
        if (dec.methods.length === 0) {
            board.setArtifactStatus(t.id, "blocked", "decompose_empty");
            board.propagateBlocked();
            await persist();
            continue;
        }

        // —— 落图：对齐 → 环检测 → 加边（全代码）——
        await materializeMethods(t.id, dec);

        // —— 阻塞换路检查 ——
        const needReroute = board.propagateBlocked();
        if (needReroute.length) await handleReroutes(needReroute);

        // —— 真闭包回填（纯代码，可能级联）——
        board.backfill();
        await persist();
    }

    // 轮次熔断：超过上限仍未收敛，诚实报告当前状态
    Logger.warn(`${tag} 达到轮次上限 ${MAX_ITERATIONS}，未收敛`);
    board.setArtifactStatus(finalId, "blocked", `max_iterations(${MAX_ITERATIONS})`);
    return { ok: false, report: board.report(finalId), board };

    /* ================= 内部函数 ================= */

    /** 把一次拆解结果落图：逐 method(OR) 逐 input(AND)，对齐→环检测→加边 */
    async function materializeMethods(outputId: string, dec: Decompose): Promise<void> {
        for (const m of dec.methods) {                       // OR
            const mid = board.addMethod(outputId, m.transform, m.gate);
            let methodOk = true;

            for (const input of m.inputs) {                   // AND
                const id = await resolveArtifact(input);       // 对齐或登记

                // 环检测：graphology-dag 加边前预判，被拦截则留痕、该 method 阻塞
                const r = board.tryAddInputEdge(id, mid);
                if (!r.ok) {
                    Logger.warn(`${tag} 拦截成环 ${id} -> ${mid}`);
                    board.recordRejected(mid, id, r.reason);
                    board.setMethodStatus(mid, "blocked", `edge_rejected:${r.reason}`);
                    methodOk = false;
                    break;
                }
            }
            if (methodOk) Logger.debug(`${tag} method ${mid} 落图: [${board.inputsOf(mid).join(", ")}] -> ${outputId}`);
        }
    }

    /** 对齐或登记一个 input 交付物，返回稳定 id */
    async function resolveArtifact(input: { name: string; modality: string; definition: string }): Promise<string> {
        const cand = normalizeId(input.name);
        if (board.artifact(cand)) return cand;               // 精确命中，直接复用

        // 代码相似度预筛（廉价）：取 top-3 高相似
        const topK = board.artifacts()
            .map(({ id, attrs }) => ({ id, definition: attrs.definition, sim: diceSim(cand, id) }))
            .filter((x) => x.sim >= PRESCREEN_THRESHOLD)
            .sort((a, b) => b.sim - a.sim)
            .slice(0, 3);

        if (topK.length > 0) {
            // ▶ LLM【X3 对齐复核】获取: { decision, matched_id, confidence } —— 比对定义而非名字
            const align = await NL2Format({
                model: getSmartModel(undefined, ctx),
                instructions: ALIGN_SYSTEM,
                prompt: alignUser({ name: cand, definition: input.definition }, topK),
                output: Output.object({ schema: AlignSchema }),
            });
            Logger.debug(`${tag} align ${cand}: ${align.output.decision}(${align.output.confidence})`);

            if (
                align.output.decision === "reuse" &&
                align.output.matched_id &&
                board.artifact(align.output.matched_id) &&
                align.output.confidence >= ALIGN_CONF_THRESHOLD
            ) {
                board.addAlias(align.output.matched_id, cand); // 吸收近义表述，防再漂移
                return align.output.matched_id;
            }
            // 低置信不自动合并：新建 + 待人工确认标记
            return board.addArtifact(cand, {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                modality: input.modality as any,
                definition: input.definition,
                status: "pending",
                needsReview: true,
            });
        }
        return board.addArtifact(cand, {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            modality: input.modality as any,
            definition: input.definition,
            status: "pending",
        });
    }

    /** 换路：对全 method 阻塞的节点调 X4；give_up 或超次数则 blocked 向上传播 */
    async function handleReroutes(nodeIds: string[]): Promise<void> {
        for (const id of nodeIds) {
            const a = board.artifact(id);
            if (!a || a.status !== "pending") continue;

            const tried = (rerouteCount.get(id) ?? 0);
            if (tried >= MAX_REROUTE_PER_NODE) {
                board.setArtifactStatus(id, "blocked", `reroute_exhausted(${tried})`);
                continue;
            }
            rerouteCount.set(id, tried + 1);

            // 从图上取失败记录（含被拦截的边）作为 X4 输入 —— 失败不删的价值就在这里
            const failures = board.methodsOf(id).map((m) =>
                `- [${m.attrs.status}] ${m.attrs.transform}` +
                (m.attrs.blockReason ? ` (原因: ${m.attrs.blockReason})` : "") +
                (m.attrs.rejected.length ? ` (被拦截边: ${m.attrs.rejected.map((r) => `${r.input}:${r.reason}`).join(", ")})` : ""),
            ).join("\n") || "(无记录)";

            // ▶ LLM【X4 阻塞换路】获取: { give_up, new_methods[] }
            const re = await NL2Format({
                model: getSmartModel(undefined, ctx),
                instructions: REROUTE_SYSTEM,
                prompt: rerouteUser(
                    { id, modality: a.modality, definition: a.definition },
                    failures, board.registrySummary(), board.sourcesSummary(),
                ),
                output: Output.object({ schema: RerouteSchema }),
            });
            Logger.debug(`${tag} reroute ${id}: give_up=${re.output.give_up}`);
            ctx?.notify(`换路:${id}`, re.output.reason);

            if (re.output.give_up || re.output.new_methods.length === 0) {
                board.setArtifactStatus(id, "blocked", `give_up:${re.output.reason}`);
                board.propagateBlocked(); // blocked 沿 produces 向上传播，可能触发祖先换路（下轮处理）
                continue;
            }
            // 新思路落图（同一套对齐/环检测流程）
            await materializeMethods(id, { is_grounded: false, grounded_from: [], methods: re.output.new_methods });
        }
    }
}