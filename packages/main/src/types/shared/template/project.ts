import { z } from "zod";
import { infoCardViewSchema } from "./info-card.js";
import { leftSidebarItemJSONSchema } from "./sidebar.js";
import { targetOptionSchema } from "./target.js";

/** Partial<Omit<InfoCardView, "id">> */
const partialInfoCardSchema = infoCardViewSchema.omit({ id: true }).partial();

export type PartialInfoCard = z.infer<typeof partialInfoCardSchema>

export const projectActivityDataSchema = z.object({
    activities: z.array(leftSidebarItemJSONSchema),
    header: z.object({
        title: z.string(),
        detail: z.string(),
    }),
    infocards: z
        .object({
            "input-manager": partialInfoCardSchema.optional(),
            "spec-setting": partialInfoCardSchema.optional(),
            output: partialInfoCardSchema.optional(),
        })
        .optional(),
    targets: z.array(targetOptionSchema).optional(),
    /** dashboard 中的提示词文本 */
    hints: z
        .object({
            idle: z.string().optional(),
            running: z.string().optional(),
            term: z.string().optional(),
        })
        .optional(),
    /** 无法开始工作时的提示 */
    needInput: z
        .object({
            title: z.string().optional(),
            description: z.string().optional(),
            ignore: z.boolean().optional(),
        })
        .optional(),
});

export type ProjectActivityData = z.infer<typeof projectActivityDataSchema>;
