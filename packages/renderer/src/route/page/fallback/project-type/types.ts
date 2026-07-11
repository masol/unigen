export interface ProjectType {
    /** 模板 id，对话框最终返回此值 */
    id: string;
    /** 展示名称，如「产品需求文档」 */
    name: string;
    /** 一句话说明，帮助小白理解这个类型能做什么 */
    description: string;
    /** 图标字符串，由组件转化为图标（tabler 图标名，如 'file-text'） */
    icon: string;
    /** 可选：分类标签，用于轻量分组 */
    category?: string;
}

/** 空白项目类型的固定 id，永远无条件可选 */
export const BLANK_PROJECT_TYPE_ID = 'blank';

/** 空白项目类型定义（本地内置，不依赖服务器返回） */
export const BLANK_PROJECT_TYPE: ProjectType = {
    id: BLANK_PROJECT_TYPE_ID,
    name: '空白项目',
    description: '从零开始，所有功能由你自定义。未来可发布为新的项目类型。',
    icon: 'IconSquarePlus',
    category: '通用',
};