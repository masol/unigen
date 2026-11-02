import { z } from 'zod';


export const RunnerParamSchema = z.object({
    msg: z.string(),
    sessId: z.string().optional(),
    seq: z.number()
})

export type RunnerParam = z.infer<typeof RunnerParamSchema>;
