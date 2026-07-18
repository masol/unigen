import { makePlanDesc } from "$libs/blueprint/capability/is.js";
import { Capability } from "$types/blueprint/capability.js";
import { KV_TOOLS, PASS_CODEGEN } from "../config.js";
import { PlanContext, ResolvedTool } from "../context.js";

/**
 * 【P-09 · Pass2.5:工具步落定】候选(自然语言)→ 工具 id(代码侧)。
 * 无命中不断链:assumeTool 假定业界工具,assumed=true 落盘,交付时汇总待确认。
 */
export async function passNode(cap: Capability, pctx: PlanContext): Promise<void> {
    const candidates = pctx.kvGet<string[]>(cap.id, KV_TOOLS) ?? [];
    const resolved: ResolvedTool[] = [];
    for (const c of candidates) {
        const hits = await pctx.resolveTools(c);
        resolved.push(hits[0] ?? pctx.assumeTool(c, `链路提名的工具候选:${c}`));
    }
    pctx.kvSet(cap.id, KV_TOOLS, resolved);
    // @TODO: 依据落定工具的真实 I/O,回写细化本步输入/输出 metag schema(类型再精化)
    cap.name = makePlanDesc(PASS_CODEGEN);
    pctx.prjdb.upcertCapa(cap);
    pctx.trace(cap.id, 'node', `工具落定:${resolved.map((t) => `${t.name}${t.assumed ? '(假定)' : ''}`).join('、')}`);
}