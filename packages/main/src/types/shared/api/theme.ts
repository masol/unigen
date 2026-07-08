import { z } from "zod";


export const GetThemeSchema = z.object({
    dark: z.string().nullable(),
    light: z.string().nullable()
})

export type GetThemeType = z.infer<typeof GetThemeSchema>
