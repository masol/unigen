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

export type CapaIOType = string | {
    /** 展示文本，支持中文/英文/其他语言，前端展示、注释使用 */
    label: string;
    /** 归一化对齐变量名，驼峰/下划线，全局唯一，消歧核心标识 */
    fieldKey: string;
}