import type { ProjectType } from '@app/main/types';
export type { ProjectType };

/** 空白项目类型的固定 id，永远无条件可选 */
export const BLANK_PROJECT_TYPE_ID = 'blank';

/** 空白项目类型定义（本地内置，不依赖服务器返回） */
export const BLANK_PROJECT_TYPE: ProjectType = {
    id: BLANK_PROJECT_TYPE_ID,
    name: '空白项目',
    description: '从零开始，所有功能由你自定义。未来可发布为新的项目类型。',
    icon: 'IconSquarePlus',
};