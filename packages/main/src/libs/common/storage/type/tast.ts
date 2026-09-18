import z from "zod";

export const execOutputSchema = z.object({
    status: z.enum(['success', 'fail']).describe('执行状态，成功或失败'),
    output: z.string().optional().describe(
        '执行成功时的结果摘要或主要内容（如报告全文、文案内容等）'
    ),
    output_path: z.string().optional().describe(
        '输出位置。若生成了单个文件，则为该文件的完整路径；若生成了多个文件，则为存放这些文件的目录路径。'
    ),
    error: z.string().optional().describe('执行失败时的错误信息'),
});

export const execInputSchema = z.object({
    goal: z.string().describe('一句话目标陈述，必须清晰完整。示例："生成电动车市场报告，用于内部决策"'),
    target_user: z.string().describe('目标用户画像，说明给谁用，如"公司高管"、"市场部经理"等'),
    use_scenario: z.string().describe('使用场合，说明在什么情况下使用，如"周会汇报"、"产品发布前"等'),
    requirements: z.array(z.string()).optional().describe('格式、约束、特殊要求的列表，如["包含3个emoji", "正文200字左右"]'),
    alternatives: z.string().optional().describe('替代品分析，说明当前替代方案是什么，如"目前使用Excel手工统计"'),
    context: z.string().optional().describe(
        '执行单元需要的背景信息。如果是延续任务，必须包含历史任务摘要，并继承历史的用户画像。'
    ),
});

export type ExecOutput = z.infer<typeof execOutputSchema>;
export type ExecInput = z.infer<typeof execInputSchema>;

export const execInputListSchema = z.array(execInputSchema).describe(
    '子任务列表。严格按照顺序提取每个子任务，不得遗漏、合并或调整顺序。数组中的每一项对应一个独立子任务，索引顺序即为执行顺序。'
);
export type ExecInputList = z.infer<typeof execInputListSchema>;

export type TaskWithKey = {
    key: string; // 当前任务在 TasksStorage 中的键（根为 taskId，子节点为 `${key}.${index}`）
    task: ExecInput;
}
export type TaskWithKeyList = TaskWithKey[];