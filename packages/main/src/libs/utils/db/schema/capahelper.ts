import { z } from 'zod';

/**
 * 1. 使用 Zod 定义 FewShotExample 的结构
 */
export const FewShotExampleSchema = z.object({
    scenario: z.string().optional(),
    input: z.array(z.string()),
    thoughtProcess: z.string().optional(),
    output: z.array(z.string()),
    kind: z.enum(["pass", "fail"]).optional(),
});

export type FewShotExample = z.infer<typeof FewShotExampleSchema>;
