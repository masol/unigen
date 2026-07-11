import { z } from 'zod';

export const projectTypeSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    icon: z.string(),
    author: z.string().optional(),
    version: z.string().optional()
});

export type ProjectType = z.infer<typeof projectTypeSchema>;