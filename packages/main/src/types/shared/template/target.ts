import { z } from "zod";

export const targetOptionSchema = z.object({
    value: z.string().optional(),
    label: z.string(),
    desc: z.string(),
    icon: z.string(),
    step: z.number().optional(),
});

export type TargetOption = z.infer<typeof targetOptionSchema>;