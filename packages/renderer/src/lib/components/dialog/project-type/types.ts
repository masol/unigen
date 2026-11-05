import type { ProjectType } from '@app/main/types';
export type { ProjectType };

/** 工作流工坊类型的固定 id，永远无条件可选 */
export const BLANK_PROJECT_TYPE_ID = 'blank';

/** 工作流工坊类型定义（本地内置，不依赖服务器返回） */
export const BLANK_PROJECT_TYPE: ProjectType = {
    id: BLANK_PROJECT_TYPE_ID,
    name: '直通任务',
    description: '透传给模型的原始对话任务，适合自定义工作流或直接与模型交互。',
    icon: 'IconSquarePlus',
};

/** 「新建任务」对话框的返回值 */
export interface CreateProjectResult {
    /** 用户最终选中的任务类型 id */
    typeId: string;
    /** 用户填写的任务名称（已 trim，非空） */
    name: string;
}