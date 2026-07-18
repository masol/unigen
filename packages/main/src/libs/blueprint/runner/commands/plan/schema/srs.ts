import { z } from "zod";

export const DataId = z.string().regex(/^D-\d{2}$/);
export const FuncId = z.string().regex(/^F-\d{2}$/);
export const AssumId = z.string().regex(/^A-\d{2}$/);
export const Ref = z.string().regex(/^[DF]-\d{2}$/);

export const SrsSchema = z.object({
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
});

export type Srs = z.infer<typeof SrsSchema>;