import { safeApi } from '$lib/utils/api';
import { type ProjectType } from './types';

/**
 * 获取本地已安装的有效任务类型。
 * Electron 环境下这里应替换为读取本地已安装模板的 IPC 调用。
 * 返回列表不含工作流工坊类型——工作流工坊由对话框内置置顶。
 */
export async function fetchInstalledProjectTypes(): Promise<ProjectType[]> {
    return await safeApi().system.prjTypes();
}

/**
 * 获取「新建任务」对话框打开时的默认任务名称。
 * 由上层注入实际实现（如基于时间戳、模板名或工作区既有命名规则生成）。
 * 返回空字符串时，对话框将显示占位符并等待用户输入。
 */
export async function fetchDefaultProjectName(): Promise<string> {
    // TODO: 接入真实的默认命名策略
    return '';
}