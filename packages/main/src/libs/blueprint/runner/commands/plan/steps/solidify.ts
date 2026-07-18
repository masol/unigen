/**
 * ============================================================================
 * 【P-06 · Pass1:交付物数据结构固化(交付物为中心)】
 * ============================================================================
 * LLVM 视角:先固化类型再降级指令。metag.schema 即本编译器的类型/IR:
 * 后续反推链路、节点发码、运行期校验(modus tollens 的命题 Q)全部以它为铁律。
 * 流程:
 *  1. 代码侧解析工具(searchTools,缓存,落盘 KV_TOOLS)——LLM 全程不查工具;
 *  2. FORM 分流(text/binary/other,沿用 realize 的 FORM 提示词);
 *  3. LLM 依据 需求文档+工具真实 I/O 设计字段级 spec(Prism 收敛→safefmt 提取);
 *  4. 固化 metag.schema + KV_DELIVERABLE_SPEC 落盘;
 *  5. 状态推进 → #plan::chain(other → impossible)。
 */
import { makePlanDesc } from '$libs/blueprint/capability/is.js';
import { getSmartModel } from '$libs/model/balancer/get-smart-model.js';
import { safefmt } from '$libs/model/llm/outline.js';
import { throwUnprcessable } from '$libs/utils/err.js';
import { Capability } from '$types/blueprint/capability.js';
import { generateText, Output } from 'ai';
import Logger from 'electron-log/main.js';
import {
    FORM_BINARY, FORM_OTHER, FORM_TEXT,
    KV_DELIVERABLE_SPEC, KV_REQUIREMENT, KV_TOOLS,
    PASS_CHAIN, WORKFLOW_IMPOSSIBLE,
} from '../config.js';
import { PlanContext } from '../context.js';
import { FORM_SYSTEM, formUser } from '../prompts/realize.js';
import { SPEC_FACETS, SPEC_SYSTEM, SpecSchema, specUser, type SpecOut } from '../prompts/spec.js';
import { converge } from './realize.js'; // realize.ts 中 converge 改为 export

const tag = '[plan:solidify]';

export async function passSchema(cap: Capability, pctx: PlanContext): Promise<void> {
    const metag = pctx.prjdb.getMetag(cap.output)[0];
    if (!metag) throwUnprcessable(`未定位输出 metag:${cap.id}`);
    const target = { name: metag.fieldKey, intent: metag.intent ?? '' };

    // ---- 1) 代码侧先取工具并落盘(进 LLM 前解析好,LLM 不再查询) ----
    const tools = await pctx.resolveTools(`${target.name}: ${target.intent}`);
    pctx.kvSet(cap.id, KV_TOOLS, tools);

    // ---- 2) FORM 分流 ----
    const formResult = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions: FORM_SYSTEM,
        prompt: formUser(target),
        temperature: 0,
    });
    const form = formResult.text.includes(FORM_BINARY) ? 'binary'
        : formResult.text.includes(FORM_TEXT) ? 'text'
            : formResult.text.includes(FORM_OTHER) ? 'other' : null;
    if (!form) throwUnprcessable(`FORM 输出无哨兵:${formResult.text.slice(0, 80)}`);

    if (form === 'other') {
        cap.name = makePlanDesc(WORKFLOW_IMPOSSIBLE);
        pctx.prjdb.upcertCapa(cap);
        pctx.trace(cap.id, 'schema', `非数字交付物,无法产出:${target.name}`);
        return;
    }

    // ---- 3) 字段级 spec:草稿 → Prism 收敛 → 提取 ----
    const requirement = pctx.kvGet<{ requirement: unknown }>(pctx.rootCapId, KV_REQUIREMENT);
    const toolLines = tools.length
        ? tools.map((t) => `- [${t.id}] ${t.name}: ${t.description}`).join('\n')
        : '(无命中;允许假定业界成熟工具,链路层会标注 assumed 待确认)';

    const draft0 = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions: SPEC_SYSTEM,
        prompt: specUser({ target, form, requirement, toolLines }),
    });
    const targetLine = `- 名称: ${target.name} ｜ 说明: ${target.intent}`;
    const draft = await converge({
        facets: SPEC_FACETS, targetLine, extra: `【工具清单】\n${toolLines}`,
        draft: draft0.text, label: `spec[${target.name}]`, ctx: pctx.ctx,
    });

    const specResult = await safefmt(draft, Output.object({ schema: SpecSchema }), pctx.ctx);
    if (!specResult.success) throwUnprcessable(`spec 提取失败:${specResult.err}`);
    const spec: SpecOut = specResult.value?.output;

    // ---- 4) 固化:类型写回 metag,spec 全文落盘 KV ----
    pctx.prjdb.upcertMetag({
        fieldKey: target.name,
        intent: target.intent,
        schema: spec.fields, // @TODO: fields → zod schema 的编译在 metag customType 处
    });
    pctx.kvSet(cap.id, KV_DELIVERABLE_SPEC, { form, spec });
    pctx.trace(cap.id, 'schema', `字段级 spec 固化(${form},${spec.fields.length} 字段)`);
    Logger.info(`${tag} ${target.name} → ${form},${spec.fields.length} 字段`);

    // ---- 5) 状态推进 ----
    cap.name = makePlanDesc(PASS_CHAIN);
    pctx.prjdb.upcertCapa(cap);
}