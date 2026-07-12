import { z } from "zod";

/** 单张信息卡的静态描述——纯中立，全部来自 JSON */
export const infoCardViewSchema = z.object({
    /** 卡片唯一标识，点击时用于定位侧栏 activity */
    id: z.string(),
    /** 动态图标名（走 RuntimeIcon） */
    icon: z.string(),
    /** 主标题（如「输入」） */
    title: z.string(),
    /** 副标题（如「原始素材」） */
    subtitle: z.string().optional(),
    /** 摘要行 */
    summary: z.string().optional(),
    /** 底部引导文案 */
    hint: z.string().optional(),
    /** 点击进入的侧栏 activity id */
    activity: z.string().optional(),
});

export type InfoCardView = z.infer<typeof infoCardViewSchema>;