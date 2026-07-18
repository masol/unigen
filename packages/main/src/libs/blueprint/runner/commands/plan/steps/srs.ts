import { getSmartModel } from "$libs/model/index.js";
import { safefmt } from "$libs/model/llm/outline.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { generateText, Output, type ModelMessage } from "ai";
import Logger from "electron-log/main.js";
import { DirectedGraph } from "graphology";
import { hasCycle } from "graphology-dag";
import { PlanContext } from "../context.js";
import { SrsSchema, type Srs } from "../schema/srs.js";

const MAX_ATTEMPTS = 5;

const SYSTEM_PROMPT = `你是需求分析器。你的输出是机器可读的《业务需求规格》，唯一消费者是
下游的自动化概要设计程序，它会把每条功能需求转化为数据处理流水线的节点。无人阅读你的输出。

## 方案可行域（用于过滤需求，禁止复述进输出）
- 最终方案是一个全自动批处理任务：用户在开始时一次性提供全部初始数据（含一切参数性输入，
  不区分"数据"与"配置"），任务结束时获得交付物。中途无人参与。
- 任何需要人实时交互、审批、多轮对话的功能，禁止作为需求出现；若目标依赖此类环节，
  写其可自动化替代方案，或移入范围外。
- 无法以启动时数据形式提供的前置条件，写入假设。

## 禁写清单（出现即错误）
性能、响应时间、并发、可用性、安全、权限、存储方式、数据库、模型/工具选择、
负载均衡、配置管理、界面、日志监控。这些全部由运行平台承载。

## 极简输入处理规则
- 禁止提问。目标模糊时采用该领域最通行的解释推进。
- 每一个非用户明示的决定（交付物形态、范围取舍、质量取向）必须记录为编号假设。
- 目标中不可自动化的部分，拆除并写入范围外，注明原因。

## 硬性规则
- 数据闭包：每条功能需求的 inputs 只能引用已定义的 D-xx 或其他 F-xx，不得重复引用、
  不得自引用；引用关系必须无环；goal.deliverableRef 指向的功能需求的输出即最终交付物。
- 最小性：每条功能需求必须直接或间接贡献于交付物；每项初始数据必须被至少一条功能需求引用。
- 功能需求数量最小化，可合并的合并。同一数据产物全文只用一个名字。
- required 为 true 的初始数据，defaultBehavior 必须为 null。`;

const FORBIDDEN_TERMS = [
    "性能", "并发", "响应时间", "可用性", "安全", "权限", "加密",
    "数据库", "存储方式", "配置管理", "API key", "密钥", "负载均衡",
    "界面", "UI", "日志", "监控", "模型选择",
];

// ─── 第一层：纯代码校验 ──────────────────────────────────────────────────
export function validateSrs(srs: Srs): string[] {
    const errors: string[] = [];

    // 阶段 1：编号与命名唯一性。ID 重复会污染后续所有图分析，失败即短路。
    const dIds = new Set<string>();
    const fIds = new Set<string>();
    for (const d of srs.initialData) {
        if (dIds.has(d.id)) errors.push(`初始数据编号重复：${d.id}`);
        dIds.add(d.id);
        if (d.required && d.defaultBehavior !== null)
            errors.push(`${d.id} 为必需项，defaultBehavior 必须为 null`);
        if (!d.required && d.defaultBehavior === null)
            errors.push(`${d.id} 为可选项，必须给出 defaultBehavior`);
    }
    const outputNames = new Map<string, string>();
    for (const f of srs.functionalRequirements) {
        if (fIds.has(f.id)) errors.push(`功能需求编号重复：${f.id}`);
        fIds.add(f.id);
        const dup = outputNames.get(f.output);
        if (dup) errors.push(`数据产物名「${f.output}」被 ${dup} 与 ${f.id} 重复使用`);
        outputNames.set(f.output, f.id);
    }
    const aIds = new Set<string>();
    for (const a of srs.assumptions) {
        if (aIds.has(a.id)) errors.push(`假设编号重复：${a.id}`);
        aIds.add(a.id);
    }
    if (errors.length > 0) return errors;

    // 阶段 2：建图 + 引用检查。D、F 全部入图，边 = 数据流向（输入 → 需求）。
    const g = new DirectedGraph();
    for (const d of srs.initialData) g.addNode(d.id, { kind: "D" });
    for (const f of srs.functionalRequirements) g.addNode(f.id, { kind: "F" });

    for (const f of srs.functionalRequirements) {
        for (const ref of f.inputs) {
            if (ref === f.id) {
                errors.push(`${f.id} 引用了自身`);
            } else if (!g.hasNode(ref)) {
                errors.push(`${f.id} 引用了不存在的编号 ${ref}`);
            } else if (g.hasEdge(ref, f.id)) {
                errors.push(`${f.id}.inputs 重复引用 ${ref}`);
            } else {
                g.addEdge(ref, f.id);
            }
        }
    }
    if (!fIds.has(srs.goal.deliverableRef))
        errors.push(`goal.deliverableRef 指向不存在的功能需求 ${srs.goal.deliverableRef}`);
    if (errors.length > 0) return errors;

    // 阶段 3：无环。成环时可达性分析无意义，短路。
    if (hasCycle(g)) {
        // 定位环上节点，给模型可操作的反馈，而不是只说"有环"
        const inCycle = g
            .filterNodes((n) => {
                const sub = new Set<string>([n]);
                const stack = [n];
                while (stack.length) {
                    for (const nb of g.outNeighbors(stack.pop()!)) {
                        if (nb === n) return true;
                        if (!sub.has(nb)) { sub.add(nb); stack.push(nb); }
                    }
                }
                return false;
            });
        return [`功能需求依赖存在循环，涉及：${inCycle.join(", ")}。请调整 inputs 打破循环`];
    }

    // 阶段 4：最小性。交付物的祖先集合 = 有贡献的节点。
    const contributing = new Set<string>([srs.goal.deliverableRef]);
    const stack = [srs.goal.deliverableRef];
    while (stack.length) {
        for (const nb of g.inNeighbors(stack.pop()!)) {
            if (!contributing.has(nb)) { contributing.add(nb); stack.push(nb); }
        }
    }
    for (const id of fIds)
        if (!contributing.has(id))
            errors.push(`${id} 对交付物无贡献（未被 ${srs.goal.deliverableRef} 直接或间接依赖），请删除或合并`);
    for (const id of dIds)
        if (g.outDegree(id) === 0)
            errors.push(`初始数据 ${id} 未被任何功能需求引用，请删除或补充引用`);

    // 阶段 5：禁词扫描。不扫 assumptions / outOfScope——那里合法地提及平台职责。
    const scan = (loc: string, text: string) => {
        for (const t of FORBIDDEN_TERMS)
            if (text.includes(t))
                errors.push(`${loc} 出现禁写内容「${t}」：这是运行平台的职责，不是业务需求`);
    };
    scan("goal.acceptance", srs.goal.acceptance);
    for (const d of srs.initialData) {
        scan(`${d.id}.form`, d.form);
        scan(`${d.id}.validation`, d.validation);
    }
    for (const f of srs.functionalRequirements) {
        scan(`${f.id}.transform`, f.transform);
        scan(`${f.id}.quality`, f.quality);
    }

    return errors;
}

// ─── 第二层：LLM 裁判。返回 null 表示通过，否则返回原样回喂的问题文本 ────
async function llmJudge(originalGoal: string, srs: Srs, pctx: PlanContext): Promise<string | null> {
    const { text } = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions: `你是需求规格的自动审查器。逐项检查以下三点：
1. 可判定性：goal.acceptance 及每条功能需求的 quality，能否由程序或 LLM 裁判对照产物判定真假？含糊的（如"高质量""合理"）视为问题。
2. 假设覆盖：对照用户原始目标，规格中每个非用户明示的决定（交付物形态、范围取舍、质量取向）是否都有对应的 A-xx 假设？
3. 一致性：功能需求之间、假设与需求之间是否矛盾？transform 是否越界描述了实现手段？

如果全部通过，输出单行：PASS

如果存在问题，按以下格式输出：
ISSUE: [编号] [问题简述] [修正方向]
ISSUE: [编号] [问题简述] [修正方向]
...

只输出上述格式，不要添加任何额外说明。`,
        prompt: `用户原始输入：${originalGoal}\n\n待审查规格：\n${JSON.stringify(srs, null, 2)}`
    });
    const lines = text.split('\n').filter(l => l.trim() !== '');

    // 检查是否全部通过
    if (lines.length === 1 && lines[0].trim().indexOf('PASS') >= 0) {
        return null;
    }

    // 检查是否至少有一条 ISSUE 记录
    const issues = lines.filter(l => /^ISSUE:/i.test(l.trim()));
    if (issues.length === 0) {
        // LLM 输出格式异常，保守处理：视为不通过并记录原始输出
        Logger.warn('[LLM Judge] 格式异常，原始输出:', text);
        return null;
        // return `[格式异常] 审查器输出无法解析，请人工复核:\n${text}`;
    }

    return issues.join('\n');
}

// ─── 主流程：生成 → 机械校验 → LLM 裁判 → 失败回喂重试 ───────────────────
export async function generateSrs(desc: string, pctx: PlanContext): Promise<Srs> {
    const messages: ModelMessage[] = [
        { role: "user", content: desc },
    ];

    let lastFeedback = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const srsTextResult = await generateText({
            model: getSmartModel(),
            instructions: SYSTEM_PROMPT,
            messages,
        });
        const srsResultText = srsTextResult.text;
        messages.push(
            { role: "assistant", content: srsResultText },
        )
        const srsResult = await safefmt(srsResultText, Output.object({ schema: SrsSchema }), pctx.ctx)

        if (!srsResult.success) {
            Logger.warn("无法从回应中获取到格式化数据：", srsResultText)
            messages.push({
                role: "user",
                content: `你上一版规格未能使用如下Schema获取到格式:z.object({
goal: z.object({
    deliverable: z.string().describe("一句话定义最终交付物"),
    deliverableRef: FuncId.describe("产出最终交付物的功能需求编号"),
    acceptance: z.string().describe("对交付物的总体验收标准，必须可判定真假"),
}),
initialData: z
    .array(
        z.object({
            id: DataId,
            name: z.string().min(1).describe("数据名称，全文唯一"),
            form: z.string().describe("数据形态，文本优先"),
            required: z.boolean(),
            validation: z.string().describe("可机械执行的校验规则"),
            defaultBehavior: z
                .string()
                .nullable()
                .describe("缺省行为；required 为 true 时必须为 null"),
        }),
    )
    .min(1)
    .describe("任务启动时一次性提供的全部输入，含一切参数性输入，不区分数据与配置"),
functionalRequirements: z
    .array(
        z.object({
            id: FuncId,
            inputs: z.array(Ref).min(1).describe("只能引用 D-xx 或其他 F-xx 的编号，不得重复"),
            transform: z.string().describe("做什么，一句话，不写怎么做（不提模型/工具/存储）"),
            output: z.string().min(1).describe("命名的数据产物，全文唯一"),
            quality: z.string().describe("对输出的可判定质量标准"),
        }),
    )
    .min(1),
assumptions: z.array(
    z.object({
        id: AssumId,
        content: z.string(),
        basis: z.enum(["用户明示", "领域惯例", "推断"]),
    }),
),
outOfScope: z.array(z.object({ item: z.string(), reason: z.string() })),
})
请改进你的输出，确保可以准确获取到以上信息。`
            })
        }


        Logger.debug("SRSResult=", JSON.stringify(srsResult.value?.output, null, 2))
        const srs = srsResult.value?.output
        const errors = validateSrs(srs);
        let feedback: string;
        if (errors.length > 0) {
            feedback = errors.map((e, i) => `${i + 1}. ${e}`).join("\n");
        } else {
            const judged = await llmJudge(desc, srs, pctx);
            if (judged === null) return srs;
            feedback = judged;
        }

        lastFeedback = feedback;
        messages.push(
            {
                role: "user",
                content: `你上一版规格未通过自动校验，问题如下：\n${feedback}\n\n请修正全部问题后重新输出完整规格。保持未涉及问题的部分不变，不要引入新问题。`,
            },
        );
    }

    const msg = `SRS 生成失败：${MAX_ATTEMPTS} 次尝试后仍未通过校验。最后一轮反馈：\n${lastFeedback}`;
    Logger.error(msg);
    throwUnprcessable(msg);
}


export async function runStep(pctx: PlanContext): Promise<void> {
    void (pctx)
    // 首先检查
}