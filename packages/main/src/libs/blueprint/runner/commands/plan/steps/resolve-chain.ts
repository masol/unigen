/**
 * ============================================================================
 * 【P-13 · 链路解析闸门(resolveChain)】(附 BACKGROUND.md)
 * ============================================================================
 * 对 CHAIN 的 steps 做确定性反推,兼任 guard:
 *  - 反推外部输入:某 step 的 input 无更早 step 产出它 → 归为 DAG 外部输入,
 *    并记录被哪些 step 引用(usedBy),供文本侧递归生成;
 *  - 反推 DAG 输出:未被任何后续 step 消费的 output → 归为 DAG 输出;
 *  - 硬约束:末步产出必须逐字等于 targetName;DAG 输出至少含 targetName;
 *    无环(名称级)、无重复产出、无死产出。
 * 失败返回 {ok:false, feedback},由调用方带 feedback 回炉重生成(guard 角色)。
 */
import type { ChainOut } from '../prompts/realize.js';

export interface ResolvedInput {
    name: string;
    intent: string;      // 该外部输入作为术语的说明(取自 steps 中该输入项的 intent)
    usedBy: number[];
}

export interface ResolvedChain {
    steps: ChainOut['steps'];
    inputs: ResolvedInput[];  // DAG 外部输入(纯文本,需回文本侧递归)
    outputs: string[];        // DAG 输出(含 targetName)
}

export type ResolveResult =
    | { ok: true; resolved: ResolvedChain }
    | { ok: false; feedback: string };

export function resolveChain(chain: ChainOut, targetName: string): ResolveResult {
    const steps = chain.steps;
    if (steps.length === 0) {
        return { ok: false, feedback: '调用序列为空:必须至少有一步程序调用产出目标交付物。' };
    }

    const problems: string[] = [];

    // 1) 产出映射 + 重复产出检查
    const producedAt = new Map<string, number>(); // output_name → step index (1-based)
    steps.forEach((s, i) => {
        if (producedAt.has(s.output_name)) {
            problems.push(
                `产出「${s.output_name}」被第${producedAt.get(s.output_name)}步和第${i + 1}步重复产出,产出名必须唯一。`,
            );
        } else {
            producedAt.set(s.output_name, i + 1);
        }
    });

    // 2) 倒序反推每步输入的来源;无更早产出者 → 外部输入
    const inputMap = new Map<string, { intent: string; usedBy: number[] }>();
    steps.forEach((s, i) => {
        for (const input of s.inputs) {
            const src = producedAt.get(input.name);
            if (src === undefined) {
                const entry = inputMap.get(input.name) ?? { intent: input.intent, usedBy: [] };
                if (!entry.intent && input.intent) entry.intent = input.intent; // 补第一处非空说明
                entry.usedBy.push(i + 1);
                inputMap.set(input.name, entry);
            } else if (src >= i + 1) {
                problems.push(
                    `第${i + 1}步的输入「${input.name}」由第${src}步产出,晚于或等于当前步,构成循环依赖。请调整步骤顺序或拆分。`,
                );
            }
        }
    });

    // 3) 反推 DAG 输出:未被任何后续 step 消费的产出
    const consumed = new Set<string>(steps.flatMap((s) => s.inputs.map((i) => i.name)));
    const outputs = steps.map((s) => s.output_name).filter((name) => !consumed.has(name));

    // 4) 末步产出必须逐字等于 targetName
    const last = steps[steps.length - 1];
    if (last.output_name !== targetName) {
        problems.push(
            `最后一步的产出「${last.output_name}」必须与最终输出名「${targetName}」逐字一致,不得改写。请把末步产出名改回「${targetName}」。`,
        );
    }

    // 5) DAG 输出至少含 targetName
    if (!outputs.includes(targetName)) {
        problems.push(
            `目标交付物「${targetName}」未作为链路末端输出被产出(它被某后续步骤消费了,或根本没产出)。它必须是不被任何步骤消费的末端产出。`,
        );
    }

    // 6) 死产出:除 targetName 外,存在未被消费的悬挂产出 → 死步骤
    const danglings = outputs.filter((o) => o !== targetName);
    if (danglings.length > 0) {
        problems.push(
            `以下产出未被任何步骤消费,也不是最终交付物,属于死产出,应删去对应步骤或将其接入后续步骤:${danglings.join('、')}。`,
        );
    }

    if (problems.length > 0) {
        return { ok: false, feedback: problems.join('\n') };
    }

    const inputs: ResolvedInput[] = [...inputMap.entries()].map(([name, v]) => ({
        name,
        intent: v.intent,
        usedBy: v.usedBy,
    }));

    return {
        ok: true,
        resolved: { steps, inputs, outputs: [targetName] },
    };
}