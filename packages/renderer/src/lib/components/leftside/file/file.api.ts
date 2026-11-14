import type { FileNode } from './file.types';

const MOCK_TREE: FileNode = {
    id: 'root',
    name: 'prompts',
    type: 'folder',
    path: '/',
    children: [
        {
            id: 'folder-system',
            name: 'system',
            type: 'folder',
            path: '/system',
            children: [
                {
                    id: 'file-assistant',
                    name: 'assistant.md',
                    type: 'file',
                    path: '/system/assistant.md',
                    content: '# Assistant Prompt\n\nYou are a helpful assistant.',
                    updatedAt: Date.now() - 86_400_000,
                },
                {
                    id: 'file-coder',
                    name: 'coder.md',
                    type: 'file',
                    path: '/system/coder.md',
                    content: '# Coder Prompt\n\nYou are a senior engineer.',
                    updatedAt: Date.now() - 172_800_000,
                },
            ],
        },
        {
            id: 'folder-user',
            name: 'user',
            type: 'folder',
            path: '/user',
            children: [
                {
                    id: 'file-writing',
                    name: 'writing.md',
                    type: 'file',
                    path: '/user/writing.md',
                    content: '# Writing Prompt\n\nYou are a creative writer.',
                    updatedAt: Date.now() - 3_600_000,
                },
            ],
        },
        {
            id: 'file-readme',
            name: 'README.md',
            type: 'file',
            path: '/README.md',
            content: '# Prompts\n\nManage your prompt files here.',
            updatedAt: Date.now() - 7_200_000,
        },
    ],
};

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchFileTree(): Promise<FileNode> {
    await delay(800);
    return clone(MOCK_TREE);
}

export async function reloadFileTree(): Promise<FileNode> {
    await delay(600);
    return clone(MOCK_TREE);
}

export async function openFileApi(node: FileNode): Promise<FileNode> {
    await delay(450);
    if (node.type !== 'file') {
        throw new Error('Only files can be opened');
    }
    return clone(node);
}

export async function createFileApi(
    parentPath: string,
    name: string,
): Promise<FileNode> {
    await delay(300);
    return {
        id: crypto.randomUUID(),
        name,
        type: 'file',
        path: `${parentPath === '/' ? '' : parentPath}/${name}`,
        content: '',
        updatedAt: Date.now(),
    };
}

export async function createFolderApi(
    parentPath: string,
    name: string,
): Promise<FileNode> {
    await delay(300);
    return {
        id: crypto.randomUUID(),
        name,
        type: 'folder',
        path: `${parentPath === '/' ? '' : parentPath}/${name}`,
        children: [],
        updatedAt: Date.now(),
    };
}

export async function renameNodeApi(
    _id: string,
    _newName: string,
): Promise<void> {
    await delay(200);
}

/** 仅用于 mock：将新节点挂载到 MOCK_TREE 中 */
export function attachNodeToMockTree(parentPath: string, node: FileNode): void {
    const root = MOCK_TREE;

    function findFolder(current: FileNode): FileNode | undefined {
        if (current.path === parentPath && current.type === 'folder') return current;
        for (const child of current.children ?? []) {
            if (child.type === 'folder') {
                const found = findFolder(child);
                if (found) return found;
            }
        }
        return undefined;
    }

    if (parentPath === '/' || parentPath === '') {
        root.children = [...(root.children ?? []), node];
        return;
    }

    const parent = findFolder(root);
    if (parent) {
        parent.children = [...(parent.children ?? []), node];
    } else {
        root.children = [...(root.children ?? []), node];
    }
}

/** 仅用于 mock：重命名后同步 MOCK_TREE */
export function renameNodeInMockTree(id: string, newName: string): void {
    function walk(node: FileNode): boolean {
        if (node.id === id) {
            const oldPath = node.path;
            node.name = newName;
            const segments = oldPath.split('/');
            segments[segments.length - 1] = newName;
            node.path = segments.join('/');
            return true;
        }
        for (const child of node.children ?? []) {
            if (walk(child)) return true;
        }
        return false;
    }
    walk(MOCK_TREE);
}