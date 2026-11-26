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

/**
 * 弹出系统目录选择器，返回用户选定的目录绝对路径。
 *
 * 约定：只有「用户明确选中了一个目录」才返回字符串；
 * 用户取消、或调用失败（safeApi 已 toast 提示用户，此处不再重复上报）
 * 一律返回 undefined，调用方静默终止即可。
 *
 * @param defaultPath 对话框的初始定位目录，通常传「上次选择的目录」。
 */
export async function pickProjectDirectory(
    defaultPath?: string,
): Promise<string | undefined> {
    const result = await safeApi().system.selectDirectory({
        title: '选择项目位置',
        // 仅在非空时下发，避免把 defaultPath: undefined 送进序列化层
        ...(defaultPath ? { defaultPath } : {}),
    });

    if (!result || result.canceled || !result.path) return undefined;
    return result.path;
}