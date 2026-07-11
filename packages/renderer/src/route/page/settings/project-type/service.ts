// 说明:本地能力通过 orpc 调用 Electron main 进程。
// client 的实际导入路径以你项目为准(常见为 $lib/orpc)。
// 各 procedure 名称(listInstalled / uninstall / openInstallDir)请与 router 对齐。
import type { ProjectType, RemoteProjectType } from './types';

/** 远程能力尚未开放时抛出,供 UI 呈现「即将上线」。 */
export class FeatureNotSupportedError extends Error {
    constructor(message = '该功能尚未支持') {
        super(message);
        this.name = 'FeatureNotSupportedError';
    }
}

/** 读取本机已安装的项目类型(main 进程扫描插件目录)。 */
export async function fetchInstalledProjectTypes(): Promise<ProjectType[]> {
    return []
    // return client.projectType.listInstalled();
}

/** 卸载指定项目类型。 */
export async function uninstallProjectType(_id: string): Promise<void> {
    // await client.projectType.uninstall({ id });
}

/** 在系统文件管理器中打开本机插件目录。 */
export async function openInstallDirectory(): Promise<void> {
    // await client.projectType.openInstallDir();
}

/**
 * 远程检索——直接把关键词交给服务器处理。
 * 当前后端未实现,统一抛出 FeatureNotSupportedError。
 */
export async function searchRemoteProjectTypes(_query: string): Promise<RemoteProjectType[]> {
    throw new FeatureNotSupportedError('在线项目类型即将上线');
}