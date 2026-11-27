import { safeApi } from '$lib/utils/api';
import type { FileDocument, FileNode } from './file.types';

export async function fetchFileTree(): Promise<FileNode | null> {
    return (await safeApi().project.listPacTree()) ?? null;
}


export async function reCompile(): Promise<FileNode | null> {
    return (await safeApi().project.reCompile()) ?? null;
}


export async function readFileApi(path: string): Promise<FileDocument | null> {
    return (await safeApi().project.readPacFile({ path })) ?? null;
}

export async function openFileApi(node: FileNode): Promise<FileDocument | null> {
    if (node.type !== 'file') return null;
    return readFileApi(node.path);
}

export async function createFileApi(
    parentPath: string,
    name: string,
): Promise<FileNode | null> {
    return (await safeApi().project.createPacFile({ parentPath, name })) ?? null;
}

export async function createFolderApi(
    parentPath: string,
    name: string,
): Promise<FileNode | null> {
    return (await safeApi().project.createPacFolder({ parentPath, name })) ?? null;
}

export async function renameNodeApi(
    path: string,
    newName: string,
): Promise<{ oldPath: string; newPath: string } | null> {
    return (await safeApi().project.renamePacNode({ path, newName })) ?? null;
}

/**
 * 删除节点（文件或文件夹，文件夹递归删除）。
 *
 * 主进程 handler 无 output，成功时无返回值；失败语义交由调用方通过
 * 重新拉取文件树来校验，避免依赖 safeApi 对 void 返回值的包装约定。
 */
export async function deleteNodeApi(path: string): Promise<void> {
    await safeApi().project.deletePacNode({ path });
}