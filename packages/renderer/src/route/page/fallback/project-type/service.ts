import { type ProjectType } from './types';

/**
 * 获取本地已安装的有效项目类型。
 * Electron 环境下这里应替换为读取本地已安装模板的 IPC 调用。
 * 返回列表不含空白项目类型——空白类型由对话框内置置顶。
 */
export async function fetchInstalledProjectTypes(): Promise<ProjectType[]> {
    // TODO: 替换为真实的本地读取逻辑（如 window.electron.invoke('project-types:list')）
    await new Promise((r) => setTimeout(r, 700));

    return [
        {
            id: 'prd',
            name: '产品需求文档',
            description: '结构化的需求撰写空间，含目标、用户故事与验收标准。',
            icon: 'IconABOff',
            category: '文档',
        },
        {
            id: 'kanban',
            name: 'IconABOff',
            description: '以列与卡片管理任务流转，适合敏捷协作。',
            icon: 'IconAd',
            category: '协作',
        },
        {
            id: 'wiki',
            name: '知识库',
            description: '层级化的文档集合，沉淀团队知识与规范。',
            icon: 'IconAd',
            category: '文档',
        },
        {
            id: 'kanban3',
            name: '看板项目',
            description: '以列与卡片管理任务流转，适合敏捷协作。',
            icon: 'IconAd',
            category: '协作',
        },
        {
            id: 'wiki4',
            name: '知识库',
            description: '层级化的文档集合，沉淀团队知识与规范。',
            icon: 'IconAd',
            category: '文档',
        },
        {
            id: 'kanban5',
            name: '看板项目',
            description: '以列与卡片管理任务流转，适合敏捷协作。',
            icon: 'IconAd',
            category: '协作',
        },
        {
            id: 'wiki6',
            name: '知识库',
            description: '层级化的文档集合，沉淀团队知识与规范。',
            icon: 'IconAd',
            category: '文档',
        },
        {
            id: 'kanban7',
            name: '看板项目',
            description: '以列与卡片管理任务流转，适合敏捷协作。',
            icon: 'IconAd',
            category: '协作',
        },
        {
            id: 'wiki8',
            name: '知识库',
            description: '层级化的文档集合，沉淀团队知识与规范。',
            icon: 'IconAd',
            category: '文档',
        },
        {
            id: 'wiki81',
            name: '知识库',
            description: '层级化的文档集合，沉淀团队知识与规范。',
            icon: 'IconAd',
            category: '文档',
        },
        {
            id: 'wiki82',
            name: '知识库',
            description: '层级化的文档集合，沉淀团队知识与规范。',
            icon: 'IconAd',
            category: '文档',
        },
        {
            id: 'wiki83',
            name: '知识库',
            description: '层级化的文档集合，沉淀团队知识与规范。',
            icon: 'IconAd',
            category: '文档',
        },
        {
            id: 'wiki84',
            name: '知识库',
            description: '层级化的文档集合，沉淀团队知识与规范。',
            icon: 'IconAd',
            category: '文档',
        },
        {
            id: 'wiki85',
            name: '知识库',
            description: '层级化的文档集合，沉淀团队知识与规范。',
            icon: 'IconAd',
            category: '文档',
        },
        {
            id: 'wiki86',
            name: '知识库',
            description: '层级化的文档集合，沉淀团队知识与规范。',
            icon: 'IconAd',
            category: '文档',
        },
        {
            id: 'wiki87',
            name: '知识库',
            description: '层级化的文档集合，沉淀团队知识与规范。',
            icon: 'IconAd',
            category: '文档',
        },
    ];
}