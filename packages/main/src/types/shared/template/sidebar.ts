import { z } from "zod";
import { panelNodeSchema } from "./ast.js";

export const leftSidebarItemJSONSchema = z.object({
    id: z.string(),
    label: z.string(),
    /** 图标组件（Tabler Icons） */
    icon: z.string(),
    panel: panelNodeSchema,
});

export type LeftSidebarItemJSON = z.infer<typeof leftSidebarItemJSONSchema>;