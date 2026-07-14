/**
 * 确定性 Mock LLM —— v1 最小闭环的「LLM 替身」。
 * 真实版：换成 Vercel AI SDK 的 generateObject（固定模板 P1–P8 + zod schema）。
 * 接口保持一致：输入结构化参数，输出结构化对象。此处用一张小知识库驱动「剧本→视频」。
 */
import type { BootstrapResult, DecomposeResult } from './types.js';

// 领域知识库（真实版由 LLM 现场产出）。compound → 多 method(OR)；method 内 = AND。
const PRIMITIVES = [
    { name: 'parse_script', pre: [], eff: ['script_parsed'] },
    { name: 'record_audio', pre: [], eff: ['audio_track'] },
];
const GROUNDED = new Set(PRIMITIVES.flatMap((p) => p.eff)); // 可由 primitive 直接达成 = 触底

const DECOMP: Record<string, DecomposeResult> = {
    video_ready: {
        isGrounded: false,
        methods: [
            // 方法一：正片流水线（AND：渲染 + 配音）
            { subAttributes: ['scenes_rendered', 'audio_track'], ordering: 'sequential' },
            // 方法二（OR 备选）：退化成幻灯片
            { subAttributes: ['slideshow_ready'], ordering: 'sequential' },
        ],
    },
    scenes_rendered: { isGrounded: false, methods: [{ subAttributes: ['script_parsed'], ordering: 'sequential' }] },
    slideshow_ready: { isGrounded: false, methods: [{ subAttributes: ['script_parsed'], ordering: 'sequential' }] },
};

// P4：环境自举
export async function llmBootstrap(_task: string): Promise<BootstrapResult> {
    return { initStates: [], primitiveActions: PRIMITIVES, targetAttributes: ['video_ready'] };
}

// P5：单步拆解（兼拦截器）。target 若触底 → isGrounded=true，methods 空。
export async function llmDecompose(target: string, _vocab: string[]): Promise<DecomposeResult> {
    if (GROUNDED.has(target)) return { isGrounded: true, methods: [] };
    return DECOMP[target] ?? { isGrounded: true, methods: [] }; // 未知词保守触底，避免最小闭环发散
}

// P8：解算模拟。顺着 HDDL 选首个 method、把触底叶子映射到 primitive、去重保序。
export async function llmSimulateSolve(
    goal: string,
    tasks: { task: string; methods: { subtasks: string[] }[] }[],
): Promise<{ planFound: boolean; actionSequence: string[]; assumptions: string[] }> {
    const byTask = new Map(tasks.map((t) => [t.task, t]));
    const leafToAction: Record<string, string> = { script_parsed: 'parse_script', audio_track: 'record_audio' };
    const seq: string[] = [];
    const visit = (attr: string) => {
        if (GROUNDED.has(attr)) { const a = leafToAction[attr]; if (a && !seq.includes(a)) seq.push(a); return; }
        const t = byTask.get(attr);
        if (t?.methods[0]) t.methods[0].subtasks.forEach(visit); // 满足性搜索：选第一条 method
    };
    visit(goal);
    return {
        planFound: seq.length > 0,
        actionSequence: seq,
        assumptions: ['v1 为 LLM 模拟：仅选首个 method，未做代价最优，正确性不做符号保证'],
    };
}

// extract 的极简判定（真实版走 generateObject）
export function llmLooksLikeGoal(raw: string): boolean {
    return raw.trim().length >= 2;
}