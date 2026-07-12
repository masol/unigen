import { z } from "zod";
import { bindingSchema } from "./binding.js";

/* ── 共享子结构 ── */

/** 列表项的可选展示字段，全部由 service 数据提供，AST 不预设业务含义 */
export const listItemViewSchema = z.object({
    id: z.string(),
    /** 主标题；缺省用「第 N 项」 */
    label: z.string().optional(),
    /** 次要元信息（如时间、大小），纯展示，缺省不显示 */
    meta: z.string().optional(),
});
export type ListItemView = z.infer<typeof listItemViewSchema>;

/** 选项徽章：视觉修饰完全由 AST 描述（原 hint/short/tone/swatch 的统一形态） */
export const optionBadgeSchema = z.object({
    /** 文本徽章内容；无则视为纯色块徽章 */
    text: z.string().optional(),
    /** 徽章附加类名（渐变、配色等） */
    className: z.string().optional(),
});
export type OptionBadge = z.infer<typeof optionBadgeSchema>;

export const selectOptionSchema = z.object({
    value: z.string(),
    label: z.string(),
    sub: z.string().optional(),
    badge: optionBadgeSchema.optional(),
});
export type SelectOption = z.infer<typeof selectOptionSchema>;

export const buttonOptionSchema = z.object({
    value: z.string(),
    label: z.string(),
    sub: z.string().optional(),
    /** 状态色点类名 */
    dot: z.string().optional(),
});
export type ButtonOption = z.infer<typeof buttonOptionSchema>;

/* ── 叶子节点（非递归，独立导出便于复用/精确校验） ── */

export const textListNodeSchema = z.object({
    type: z.literal("text-list"),
    binding: bindingSchema,
    addLabel: z.string(),
    emptyTitle: z.string(),
    emptyIcon: z.string().optional(),
    /** 弹窗组件由外部注册，这里只给文案 */
    addDialogTitle: z.string().optional(),
    editDialogTitle: z.string().optional(),
    editDialogDescription: z.string().optional(),
    editAlert: z.boolean().optional(),
    /** 删除确认文案，缺省用通用中性词 */
    confirmTitle: z.string().optional(),
    confirmMessage: z.string().optional(),
});
export type TextListNode = z.infer<typeof textListNodeSchema>;

export const fieldNodeSchema = z.object({
    type: z.literal("field"),
    binding: bindingSchema,
    label: z.string(),
    editor: z.enum(["inline", "dialog"]),
    placeholder: z.string().optional(),
    emptyHint: z.string().optional(),
    dialogTitle: z.string().optional(),
    dialogDescription: z.string().optional(),
    alert: z.boolean().optional(),
    /** 只读：可展示、不可编辑 */
    readonly: z.boolean().optional(),
});
export type FieldNode = z.infer<typeof fieldNodeSchema>;

export const imageGridNodeSchema = z.object({
    type: z.literal("image-grid"),
    binding: bindingSchema,
    /** 文件资源相对目录（图片存放位置），文件操作必需 */
    dir: z.string(),
    addLabel: z.string(),
    emptyTitle: z.string(),
    emptyHint: z.string().optional(),
    emptyIcon: z.string().optional(),
    confirmTitle: z.string().optional(),
    confirmMessage: z.string().optional(),
});
export type ImageGridNode = z.infer<typeof imageGridNodeSchema>;

export const selectNodeSchema = z.object({
    type: z.literal("select"),
    binding: bindingSchema,
    label: z.string(),
    icon: z.string().optional(),
    options: z.array(selectOptionSchema),
    /** 读值无效时的回退 */
    fallback: z.string(),
});
export type SelectNode = z.infer<typeof selectNodeSchema>;

export const buttonGroupNodeSchema = z.object({
    type: z.literal("button-group"),
    binding: bindingSchema,
    label: z.string(),
    icon: z.string().optional(),
    options: z.array(buttonOptionSchema),
    fallback: z.string(),
    columns: z.number().optional(),
});
export type ButtonGroupNode = z.infer<typeof buttonGroupNodeSchema>;

/** 直接渲染 markdown 内容的节点 */
export const markdownNodeSchema = z.object({
    type: z.literal("markdown"),
    /** 内联 markdown 源文；与 binding 二选一 */
    content: z.string().optional(),
    /** 从 service 读取 markdown 源（动态内容） */
    binding: bindingSchema.optional(),
    /** 是否流式渲染（如 LLM 输出） */
    streaming: z.boolean().optional(),
    /** 错误风格 */
    error: z.boolean().optional(),
});
export type MarkdownNode = z.infer<typeof markdownNodeSchema>;

/* ── 递归节点：先声明 TS 类型，再用 z.lazy 回填 ── */

export interface PanelNode {
    type: "panel";
    children: DynNode[];
}

export interface AccordionSectionNode {
    type: "accordion-section";
    title: string;
    icon?: string;
    defaultOpen?: boolean;
    /** "count" = 自动取第一个 list 子节点长度 */
    badge?: string;
    children: DynNode[];
}

export type DynNode =
    | PanelNode
    | AccordionSectionNode
    | TextListNode
    | FieldNode
    | ImageGridNode
    | SelectNode
    | ButtonGroupNode
    | MarkdownNode;

export const panelNodeSchema: z.ZodType<PanelNode> = z.lazy(() =>
    z.object({
        type: z.literal("panel"),
        children: z.array(dynNodeSchema),
    }),
);

export const accordionSectionNodeSchema: z.ZodType<AccordionSectionNode> = z.lazy(() =>
    z.object({
        type: z.literal("accordion-section"),
        title: z.string(),
        icon: z.string().optional(),
        defaultOpen: z.boolean().optional(),
        badge: z.string().optional(),
        children: z.array(dynNodeSchema),
    }),
);

/**
 * 递归联合：因分支含递归节点，使用 z.union 而非 discriminatedUnion。
 * z.lazy 保证前向引用可解析；显式 z.ZodType<DynNode> 消除推断歧义。
 */
export const dynNodeSchema: z.ZodType<DynNode> = z.lazy(() =>
    z.union([
        panelNodeSchema,
        accordionSectionNodeSchema,
        textListNodeSchema,
        fieldNodeSchema,
        imageGridNodeSchema,
        selectNodeSchema,
        buttonGroupNodeSchema,
        markdownNodeSchema,
    ]),
);