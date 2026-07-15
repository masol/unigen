/**
 * ============================================================================
 * 目录：src/lexicon —— 词表对齐管理器（LexiconManager）
 * ============================================================================
 * 【子任务】落实 §5「词表对齐：工程天花板」。多阶段拆解中 LLM 易造近义词
 * (code_ready→is_code_finished)，对齐失败会让图分裂成互不连通碎片。代码层强控把概念
 * 收敛到稳定 ID，是整条路线成败关键。任务书 1.1 / P6。
 *
 * 【接口】
 * - normalize(term):string —— 强制小写 snake_case。所有名字进图前必须先过；纯函数无 LLM。
 * - register(term):LexId —— 归一化后登记返回稳定 ID；已存在幂等返回。
 * - align(candidate, vocab?):Promise<AlignResult> —— 近义词拦截，封 P6，两级判定：
 *     ① 廉价预筛：嵌入/字符串相似度(Jaro-Winkler/编辑距离/token集合)打分，
 *        低于阈值直接判 'new'，不调 LLM。
 *     ② 高相似命中才调 P6 复核「是否等同已有节点」。
 *   ⚠ 低置信不自动合并：返回 'new'+confidence，调用方标「待确认/谨慎新建」，绝不悄悄合并。
 *   命中等同 → 'reuse'+matchedId，强制复用不新建。
 * - vocabulary():string[] —— 返回当前所有节点 ID，供拆解作 allowed_vocabulary，
 *   引导 LLM 优先复用已有概念（§5 词表复用）。
 *
 * 【实现要求】
 * - 内部 term→LexId 注册表，归一化字面量作主键。
 * - 预筛阈值、P6 触发阈值做成可配置常量（§8 待用真实失败率调参）。
 * - align 调 P6 处埋 span(candidate/预筛top-k/decision/confidence)。
 * - 不直接写提示词文本（P6 在 src/prompts，此处只调用）。
 * - 依赖：src/types、src/prompts(P6)、src/telemetry。
 */
/**
 * LexiconManager（§5）。v1：normalize + register + 基于字符串相似度的 align。
 * 真实版：align 的高相似分支调 P6（LLM 复核）；低置信不自动合并。
 */
import type { AlignResult } from './types.js';

export class LexiconManager {
    private ids = new Set<string>();

    normalize(term: string): string {
        return term.trim().toLowerCase()
            .replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }
    register(term: string): string { const id = this.normalize(term); this.ids.add(id); return id; }
    has(id: string): boolean { return this.ids.has(this.normalize(id)); }
    vocabulary(): string[] { return [...this.ids]; }

    // 近义词拦截：命中已有 → reuse；否则 new。低置信绝不自动合并。
    align(candidate: string): AlignResult {
        const id = this.normalize(candidate);
        if (this.ids.has(id)) return { decision: 'reuse', matchedId: id, confidence: 1 };
        let best = ''; let bestScore = 0;
        for (const known of this.ids) { const s = sim(id, known); if (s > bestScore) { bestScore = s; best = known; } }
        if (bestScore >= 0.9) return { decision: 'reuse', matchedId: best, confidence: bestScore }; // 真实版此处叫 P6
        return { decision: 'new', confidence: bestScore }; // 待人工确认 / 谨慎新建
    }
}

// 极简字符相似度（Dice bigram），真实版可换嵌入。
function sim(a: string, b: string): number {
    if (a === b) return 1;
    const bg = (s: string) => { const g: string[] = []; for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2)); return g; };
    const A = bg(a), B = bg(b); if (!A.length || !B.length) return 0;
    const setB = new Map<string, number>(); B.forEach((x) => setB.set(x, (setB.get(x) ?? 0) + 1));
    let inter = 0; A.forEach((x) => { const c = setB.get(x) ?? 0; if (c > 0) { inter++; setB.set(x, c - 1); } });
    return (2 * inter) / (A.length + B.length);
}