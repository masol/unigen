import z from "zod";

export const GoalHistorySchema = z.object({
    maxSteps: z.number().describe('最大循环次数。'),
});
export type GoalHistory = z.infer<typeof GoalHistorySchema>;
