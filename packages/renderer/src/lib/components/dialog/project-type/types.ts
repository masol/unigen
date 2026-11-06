import type { ProjectType } from '@app/main/types';
export type { ProjectType };

/** 工作流工坊类型的固定 id，永远无条件可选 */
export const BLANK_PROJECT_TYPE_ID = 'blank';

/** 工作流工坊类型定义（本地内置，不依赖服务器返回） */
export const BLANK_PROJECT_TYPE: ProjectType = {
    id: BLANK_PROJECT_TYPE_ID,
    name: '直通项目',
    description: '对话透传给模型。',
    icon: 'IconSquarePlus',
};

/** 「新建项目」对话框的返回值 */
export interface CreateProjectResult {
    /** 用户最终选中的项目类型 id */
    typeId: string;
    /** 用户填写的项目名称（已 trim，非空） */
    name: string;
}