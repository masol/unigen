import log from 'electron-log/renderer';
import {
    attachNodeToMockTree,
    createFileApi,
    createFolderApi,
    fetchFileTree,
    openFileApi,
    reloadFileTree,
    renameNodeApi,
    renameNodeInMockTree,
} from './file.api';
import type { FileNode } from './file.types';

function insertChild(
    root: FileNode,
    parentPath: string,
    node: FileNode,
): FileNode {
    if (parentPath === '/' || parentPath === '') {
        return { ...root, children: [...(root.children ?? []), node] };
    }
    return {
        ...root,
        children: (root.children ?? []).map((c) => {
            if (c.type !== 'folder') return c;
            if (c.path === parentPath) {
                return { ...c, children: [...(c.children ?? []), node] };
            }
            if (parentPath.startsWith(`${c.path}/`)) {
                return insertChild(c, parentPath, node);
            }
            return c;
        }),
    };
}

function findFolderByPath(root: FileNode, path: string): FileNode | null {
    if (path === '/' || path === '') {
        return root.type === 'folder' ? root : null;
    }
    if (root.type === 'folder' && root.path === path) return root;
    for (const c of root.children ?? []) {
        if (c.type !== 'folder') continue;
        if (c.path === path) return c;
        if (path.startsWith(`${c.path}/`)) {
            const found = findFolderByPath(c, path);
            if (found) return found;
        }
    }
    return null;
}

function getParentPath(path: string): string {
    const idx = path.lastIndexOf('/');
    return idx <= 0 ? '/' : path.slice(0, idx);
}

/** 将文件夹路径拆成祖先链，例如 '/a/b' → ['/a', '/a/b']。 */
function buildAncestorChain(parentPath: string): string[] {
    if (!parentPath || parentPath === '/') return [];
    const parts = parentPath.split('/').filter(Boolean);
    const chain: string[] = [];
    let acc = '';
    for (const part of parts) {
        acc += `/${part}`;
        chain.push(acc);
    }
    return chain;
}

class FileStore {
    #tree = $state<FileNode | null>(null);
    #isLoading = $state(false);
    #error = $state<string | null>(null);
    #activeFileId = $state<string | null>(null);
    #openedFileId = $state<string | null>(null);
    #selectedFolderPath = $state<string | null>(null);
    #searchQuery = $state('');
    #openingFileId = $state<string | null>(null);
    #openError = $state<string | null>(null);
    #revealNodeId = $state<string | null>(null);
    #revealPathChain = $state<string[]>([]);

    get tree() { return this.#tree; }
    get isLoading() { return this.#isLoading; }
    get error() { return this.#error; }
    get activeFileId() { return this.#activeFileId; }
    get openedFileId() { return this.#openedFileId; }
    get selectedFolderPath() { return this.#selectedFolderPath; }
    get searchQuery() { return this.#searchQuery; }
    get openingFileId() { return this.#openingFileId; }
    get openError() { return this.#openError; }
    get revealNodeId() { return this.#revealNodeId; }

    readonly hasSearch = $derived(this.#searchQuery.trim().length > 0);

    /** 该 folder 是否应在当前 reveal 中展开。 */
    shouldExpandFolder(path: string): boolean {
        return this.#revealPathChain.includes(path);
    }

    clearReveal(): void {
        if (this.#revealNodeId === null && this.#revealPathChain.length === 0) return;
        this.#revealNodeId = null;
        this.#revealPathChain = [];
    }

    #reveal(nodeId: string, parentPath: string): void {
        this.#revealPathChain = buildAncestorChain(parentPath);
        this.#revealNodeId = nodeId;
    }

    hasSiblingWithName(
        parentPath: string,
        name: string,
        excludeId: string | null,
    ): boolean {
        if (!this.#tree) return false;
        const parent = findFolderByPath(this.#tree, parentPath);
        if (!parent) return false;
        return (parent.children ?? []).some(
            (c) => (excludeId === null || c.id !== excludeId) && c.name === name,
        );
    }

    async load(): Promise<void> {
        if (this.#tree && !this.#error) return;
        this.#isLoading = true;
        this.#error = null;
        try {
            this.#tree = await fetchFileTree();
            log.info('[FileStore] tree loaded');
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[FileStore] load failed', err);
        } finally {
            this.#isLoading = false;
        }
    }

    async reload(): Promise<void> {
        this.#isLoading = true;
        this.#error = null;
        try {
            this.#tree = await reloadFileTree();
            log.info('[FileStore] tree reloaded');
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[FileStore] reload failed', err);
        } finally {
            this.#isLoading = false;
        }
    }

    setActiveFile(id: string): void { this.#activeFileId = id; }

    setSelectedFolder(path: string | null): void {
        this.#selectedFolderPath = path;
    }

    setSearchQuery(value: string): void { this.#searchQuery = value; }
    clearSearch(): void { this.#searchQuery = ''; }

    async openFile(node: FileNode): Promise<boolean> {
        if (node.type !== 'file' || !node.name.endsWith('.md')) return false;
        if (this.#openingFileId !== null) return false;

        this.#openingFileId = node.id;
        this.#openError = null;

        try {
            await openFileApi(node);
            this.#activeFileId = node.id;
            this.#openedFileId = node.id;
            log.info(`[FileStore] open file: ${node.path}`);
            return true;
        } catch (err) {
            this.#openError = err instanceof Error ? err.message : String(err);
            log.error('[FileStore] open file failed', err);
            return false;
        } finally {
            this.#openingFileId = null;
        }
    }

    async createFile(parentPath = '/', name: string): Promise<boolean> {
        if (!this.#tree) return false;
        const trimmed = name.trim();
        if (!trimmed) return false;
        if (this.hasSiblingWithName(parentPath, trimmed, null)) {
            log.warn(`[FileStore] name conflict: ${parentPath}/${trimmed}`);
            return false;
        }

        try {
            const created = await createFileApi(parentPath, trimmed);
            this.#tree = insertChild(this.#tree, parentPath, created);
            attachNodeToMockTree(parentPath, created);
            this.#activeFileId = created.id;
            this.#reveal(created.id, parentPath);
            log.info(`[FileStore] file created: ${created.path}`);
            return true;
        } catch (err) {
            log.error('[FileStore] create file failed', err);
            return false;
        }
    }

    async createFolder(parentPath = '/', name: string): Promise<boolean> {
        if (!this.#tree) return false;
        const trimmed = name.trim();
        if (!trimmed) return false;
        if (this.hasSiblingWithName(parentPath, trimmed, null)) {
            log.warn(`[FileStore] name conflict: ${parentPath}/${trimmed}`);
            return false;
        }

        try {
            const created = await createFolderApi(parentPath, trimmed);
            this.#tree = insertChild(this.#tree, parentPath, created);
            attachNodeToMockTree(parentPath, created);
            this.#selectedFolderPath = created.path;
            this.#reveal(created.id, parentPath);
            log.info(`[FileStore] folder created: ${created.path}`);
            return true;
        } catch (err) {
            log.error('[FileStore] create folder failed', err);
            return false;
        }
    }

    async renameNode(node: FileNode, newName: string): Promise<boolean> {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === node.name) return false;

        const parentPath = getParentPath(node.path);
        if (this.hasSiblingWithName(parentPath, trimmed, node.id)) {
            log.warn(`[FileStore] name conflict: ${parentPath}/${trimmed}`);
            return false;
        }

        try {
            await renameNodeApi(node.id, trimmed);
            renameNodeInMockTree(node.id, trimmed);
            this.#tree = await fetchFileTree();
            this.#reveal(node.id, parentPath);
            log.info(`[FileStore] renamed ${node.path} → ${trimmed}`);
            return true;
        } catch (err) {
            log.error('[FileStore] rename failed', err);
            return false;
        }
    }
}

const KEY = Symbol.for('unigen.renderer.fileStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fileStore: FileStore = ((globalThis as any)[KEY] ??= new FileStore());