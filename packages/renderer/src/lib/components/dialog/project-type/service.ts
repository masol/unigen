import { safeApi } from '$lib/utils/api';
import { type ProjectType } from './types';

/**
 * 获取本地已安装的有效项目类型。
 * Electron 环境下这里应替换为读取本地已安装模板的 IPC 调用。
 * 返回列表不含工作流工坊类型——工作流工坊由对话框内置置顶。
 *
 * force 为 true 时要求主进程绕过缓存、重新扫描类型目录，
 * 用于设置页的显式刷新。
 */
export async function fetchInstalledProjectTypes(
    force = false,
): Promise<ProjectType[]> {
    return await safeApi().system.prjTypes(force);
}

/**
 * 获取「新建项目」对话框打开时的默认项目名称。
 * 由上层注入实际实现（如基于时间戳、模板名或工作区既有命名规则生成）。
 * 返回空字符串时，对话框将显示占位符并等待用户输入。
 */
export async function fetchDefaultProjectName(): Promise<string> {
    return await safeApi().system.validTaskName();
}