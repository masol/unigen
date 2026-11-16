import { safeApi } from '$lib/utils/api';
import type { FileDocument, FileNode } from './file.types';

export async function fetchFileTree(): Promise<FileNode | null> {
    return (await safeApi().project.listPacTree()) ?? null;
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