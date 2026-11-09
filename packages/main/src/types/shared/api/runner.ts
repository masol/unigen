import { z } from 'zod';

export const RunnerParamSchema = z.object({
    msg: z.string(),
    sessId: z.string(),
    seq: z.number(),
    msgId: z.string(),
    timestamp: z.number(),
    mode: z.enum(["cmd", "rerun"]).nullish(),
    files: z.array(z.string()).optional(),
})

export type RunnerParam = z.infer<typeof RunnerParamSchema>;