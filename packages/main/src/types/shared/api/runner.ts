import { z } from 'zod';

export const RunnerParamSchema = z.object({
    msg: z.string(),
    sessId: z.string(),
    seq: z.number()
})

export type RunnerParam = z.infer<typeof RunnerParamSchema>;