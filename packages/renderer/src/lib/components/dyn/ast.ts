// src/lib/components/dyn/ast.ts

/**
 * 动态面板 AST。类比 markdown mdast：type 决定渲染组件，容器有 children。
 * 设计原则：
 *  - 完全任务中立。任何默认文案都是通用中性词，绝不含具体业务语义。
 *  - JSON 未提供的字段一律不渲染，而非用业务性缺省填充。
 *  - 只保留有含义、会被使用的字段；无意义的人工标识不放进 AST。
 *
 * 扩充新节点：① 加 XxxNode 接口并入 DynNode ② 写 nodes/Xxx.svelte
 *            ③ registry.ts 注册 type → 组件
 */

/** 值绑定：声明读/写 service 的哪个 key。writeKey 缺省 = readKey */
export interface Binding {
    readKey: string;
    writeKey?: string;
}

/* ── 容器 ── */

export interface PanelNode {
    type: "panel";
    children: DynNode[];
}

export interface AccordionSectionNode {
    type: "accordion-section";
    title: string;
    /** 动态图标名，走 RuntimeIcon */
    icon?: string;
    defaultOpen?: boolean;
    /** 头部右侧徽章文案；"count" = 自动取第一个 list 子节点长度；缺省不显示 */
    badge?: string | "count";
    children: DynNode[];
}

/* ── 叶子 ── */

/** 列表项的可选展示字段，全部由 service 数据提供，AST 不预设业务含义 */
export interface ListItemView {
    id: string;
    /** 主标题；缺省用「第 N 项」 */
    label?: string;
    /** 次要元信息（如时间、大小），纯展示，缺省不显示 */
    meta?: string;
}

export interface TextListNode {
    type: "text-list";
    binding: Binding;
    addLabel: string;
    emptyTitle: string;
    emptyIcon?: string;
    /** 弹窗组件由外部注册，这里只给文案 */
    addDialogTitle?: string;
    editDialogTitle?: string;
    editDialogDescription?: string;
    editAlert?: boolean;
    /** 删除确认文案，缺省用通用中性词 */
    confirmTitle?: string;
    confirmMessage?: string;
}

export interface FieldNode {
    type: "field";
    binding: Binding;
    label: string;
    editor: "inline" | "dialog";
    placeholder?: string;
    emptyHint?: string;
    dialogTitle?: string;
    dialogDescription?: string;
    alert?: boolean;
    /** 只读：可展示、不可编辑 */
    readonly?: boolean;
}

export interface ImageGridNode {
    type: "image-grid";
    binding: Binding;
    addLabel: string;
    emptyTitle: string;
    emptyHint?: string;
    emptyIcon?: string;
    confirmTitle?: string;
    confirmMessage?: string;
}

/** 选项徽章：视觉修饰完全由 AST 描述（原 hint/short/tone/swatch 的统一形态） */
export interface OptionBadge {
    /** 文本徽章内容；无则视为纯色块徽章 */
    text?: string;
    /** 徽章附加类名（渐变、配色等） */
    className?: string;
}

export interface SelectOption {
    value: string;
    label: string;
    sub?: string;
    badge?: OptionBadge;
}

export interface SelectNode {
    type: "select";
    binding: Binding;
    label: string;
    icon?: string;
    options: SelectOption[];
    /** 读值无效时的回退 */
    fallback: string;
}

export interface ButtonOption {
    value: string;
    label: string;
    sub?: string;
    /** 状态色点类名 */
    dot?: string;
}

export interface ButtonGroupNode {
    type: "button-group";
    binding: Binding;
    label: string;
    icon?: string;
    options: ButtonOption[];
    fallback: string;
    columns?: number;
}

/** 直接渲染 markdown 内容的节点 */
export interface MarkdownNode {
    type: "markdown";
    /** 内联 markdown 源文；与 binding 二选一 */
    content?: string;
    /** 从 service 读取 markdown 源（动态内容） */
    binding?: Binding;
    /** 是否流式渲染（如 LLM 输出） */
    streaming?: boolean;
    /** 错误风格 */
    error?: boolean;
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

/** 递归/循环用的稳定 key：优先 binding.readKey，其次 title，最后交由调用方补 index */
export function keyOf(node: DynNode, index: number): string {
    if ("binding" in node && node.binding?.readKey) return node.binding.readKey;
    if ("title" in node && node.title) return node.title;
    return `${node.type}-${index}`;
}