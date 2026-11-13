import {
    IconBriefcase,
    IconPencil,
    IconUser,
    IconUsers,
} from '@tabler/icons-svelte';

/**
 * 复用第一个 Tabler 图标的具体类型作为统一类型。
 *
 * 手写 `Component<{ size?; stroke?; class? }>` 会失败：Svelte 5 的
 * `Component<Props, Exports, Bindings>` 第三泛型（bindable props）与
 * Tabler 实际组件的签名不完全对齐，逆变时会报「no match for the
 * signature」。用 `typeof` 从实际组件推断，既准确又不会随库版本漂移；
 * 所有 Tabler 图标共享同一工厂签名，四个字面类型互相兼容。
 */
export type TablerIcon = typeof IconBriefcase;

export type KbTemplate = {
    name: string;
    description: string;
    icon: TablerIcon;
};

/**
 * 推荐组织方式范例。
 *
 * description 是双用途的：既是给用户抄的范文，也是 AI 检索时的命中依据，
 * 因此按「放了什么 + 何时用 + 术语」三段式写，而不是泛泛一句。
 *
 * 该数组是唯一来源——KbGuide（渲染）、KbGuideDialog（返回名称）、
 * kb.svelte（按名称回查）都引用此处，避免三处各写一份导致漂移。
 */
export const KB_TEMPLATES: KbTemplate[] = [
    {
        icon: IconBriefcase,
        name: '员工手册',
        description:
            '公司人事与行政制度：考勤与请假规则、薪酬结构、报销与差旅标准、入职离职流程、绩效与晋升政策。凡涉及公司规定、年假天数、报销条件、社保缴纳等员工常见问题时，优先查阅本知识集。',
    },
    {
        icon: IconUser,
        name: '个人简历',
        description:
            '我的职业背景资料：工作经历与任职时间、教育背景、技能栈与熟练度、代表项目及量化成果、求职方向与期望。用于简历润色、面试问答准备、自我介绍与职业规划类问题。',
    },
    {
        icon: IconPencil,
        name: '写作偏好',
        description:
            '我的写作与表达习惯：偏好的语气（简洁、正式或口语）、常用句式与禁用词、标点与中英文混排规范、标题与列表排版约定、专业术语的中英对照。凡需要以我的口吻生成或改写文字时参考。',
    },
    {
        icon: IconUsers,
        name: '团队与项目背景',
        description:
            '所在团队与项目上下文：团队分工与协作约定、项目目标与当前进展、业务术语表、上下游系统与对接人。回答「这个项目是做什么的」「这块该找谁对接」「这个词是什么意思」类问题时使用。',
    },
];