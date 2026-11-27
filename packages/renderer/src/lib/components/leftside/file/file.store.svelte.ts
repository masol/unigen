// packages/renderer/src/lib/components/leftside/file/file.store.svelte.ts
import { pacStore } from "$lib/store/ui/pac.svelte";
import { hooks } from "$lib/utils/hook";
import log from 'electron-log/renderer';
import { toast } from "svelte-sonner";
import {
    createFileApi,
    createFolderApi,
    deleteNodeApi,
    fetchFileTree,
    reCompile,
    renameNodeApi,
} from './file.api';
import type { FileDocument, FileNode } from './file.types';

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

function findNodeByPath(root: FileNode, path: string): FileNode | null {
    if (root.path === path) return root;
    for (const c of root.children ?? []) {
        const found = findNodeByPath(c, path);
        if (found) return found;
    }
    return null;
}

function getParentPath(path: string): string {
    const idx = path.lastIndexOf('/');
    return idx <= 0 ? '/' : path.slice(0, idx);
}

/** 判断 target 是否为 ancestor 本身或其子路径（ancestor 不以 / 结尾）。 */
function isSameOrDescendantPath(target: string, ancestor: string): boolean {
    if (!ancestor || ancestor === '/') return target.startsWith('/');
    return target === ancestor || target.startsWith(`${ancestor}/`);
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

    constructor() {
        hooks.hook("project:loaded", async () => {
            // 项目加载完毕，开始加载 treeNode。
            await this.reload();
        });
    }

    #tree = $state<FileNode | null>(null);
    #isLoading = $state(false);
    #error = $state<string | null>(null);
    #activeFileId = $state<string | null>(null);
    #openedFileId = $state<string | null>(null);
    #searchQuery = $state('');
    #openingFileId = $state<string | null>(null);
    #openError = $state<string | null>(null);
    #revealNodeId = $state<string | null>(null);
    #revealPathChain = $state<string[]>([]);
    #renamingNodeId = $state<string | null>(null);

    get tree() { return this.#tree; }
    get isLoading() { return this.#isLoading; }
    get error() { return this.#error; }
    get activeFileId() { return this.#activeFileId; }
    get openedFileId() { return this.#openedFileId; }
    get searchQuery() { return this.#searchQuery; }
    get openingFileId() { return this.#openingFileId; }
    get openError() { return this.#openError; }
    get revealNodeId() { return this.#revealNodeId; }
    get renamingNodeId() { return this.#renamingNodeId; }

    /** 当前打开文件的错误数（来自 pacStore，单向依赖）。 */
    get errorCount() { return pacStore.errorCount; }

    /**
     * 兼容旧调用：打开文档真源统一在 pacStore，
     * 这里只做只读投影，避免 fileStore 再维护一份可能失真的 document。
     */
    get openedDocument(): FileDocument | null {
        const doc = pacStore.doc;
        if (!doc) return null;
        // PacFrontMatter 没有字符串索引签名，而 PacFileDocument.meta 定义为
        // Record<string, unknown>；此处属同一 YAML 友好载荷，语义一致，
        // 通过窄化 cast 维持原投影契约。
        return {
            path: doc.path,
            meta: doc.meta as unknown as FileDocument["meta"],
            content: doc.content,
            updatedAt: doc.updatedAt,
        };
    }

    readonly hasSearch = $derived(this.#searchQuery.trim().length > 0);

    /**
     * 文件树中应显示为“已打开”的节点 id。
     *
     * 不能直接用 #openedFileId：离开 /paceditor 后 pacStore 仍保留当前文档，
     * 但主界面已不在编辑器，文件树不应继续显示打开态。
     * 该 derived 只影响展示，不改变 #openedFileId（编辑器/关闭流程仍使用原字段）。
     */
    readonly displayedOpenedFileId = $derived.by(() => {
        const id = this.#openedFileId;
        if (!id) return null;
        if (!pacStore.isEditorRouteActive) return null;
        if (pacStore.status !== 'ready') return null;
        // FileNode.id 与 path 同为服务端路径；与 pacStore 当前文档对齐，
        // 避免 fileStore/pacStore 短暂不同步时误显示。
        if (pacStore.currentId !== id) return null;
        return id;
    });

    /** 该 folder 是否应在当前 reveal 中展开。 */
    shouldExpandFolder(path: string): boolean {
        return this.#revealPathChain.includes(path);
    }

    clearReveal(): void {
        if (this.#revealNodeId === null && this.#revealPathChain.length === 0) return;
        this.#revealNodeId = null;
        this.#revealPathChain = [];
    }

    startRenaming(nodeId: string): void {
        this.#renamingNodeId = nodeId;
    }

    stopRenaming(nodeId: string): void {
        if (this.#renamingNodeId === nodeId) {
            this.#renamingNodeId = null;
        }
    }

    clearRenaming(): void {
        this.#renamingNodeId = null;
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

    async reCompile(): Promise<boolean> {
        this.#isLoading = true;
        this.#error = null;
        try {
            const tree = await reCompile();
            if (!tree) {
                this.#error = '为AI加载工作指南失败';
                return false;
            }
            toast.success("AI已加载最新工作指南")
            this.#tree = tree;
            log.info('[FileStore] reCompile');
            return true;
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[FileStore] reCompile failed', err);
            return false;
        } finally {
            this.#isLoading = false;
        }
    }

    async reload(): Promise<boolean> {
        this.#isLoading = true;
        this.#error = null;
        try {
            const tree = await fetchFileTree();
            if (!tree) {
                this.#error = '加载文件树失败';
                return false;
            }
            this.#tree = tree;
            log.info('[FileStore] tree reloaded');
            return true;
        } catch (err) {
            this.#error = err instanceof Error ? err.message : String(err);
            log.error('[FileStore] reload failed', err);
            return false;
        } finally {
            this.#isLoading = false;
        }
    }

    setActiveFile(id: string): void { this.#activeFileId = id; }

    setSearchQuery(value: string): void { this.#searchQuery = value; }
    clearSearch(): void { this.#searchQuery = ''; }

    async openFile(node: FileNode): Promise<boolean> {
        if (node.type !== 'file' || !node.name.endsWith('.md')) return false;
        if (this.#openingFileId !== null) return false;

        this.#openingFileId = node.id;
        this.#openError = null;

        try {
            // 打开链条统一进入 pacStore：
            // pacStore.openFile 负责 loading、push('/paceditor')、readPacFile 与 editor 推送。
            log.debug("open pac file:", node.path);
            const ok = await pacStore.openFile(node.path);

            if (!ok) {
                this.#openError = pacStore.error ?? '打开文件失败';
                return false;
            }

            this.#activeFileId = node.id;
            this.#openedFileId = node.id;

            log.info(`[FileStore] open file via pacStore: ${node.path}`);
            return true;
        } catch (err) {
            this.#openError = err instanceof Error ? err.message : String(err);
            log.error('[FileStore] open file failed', err);
            return false;
        } finally {
            this.#openingFileId = null;
        }
    }

    /**
     * 关闭当前打开的文件：委托 pacStore 完成导航与未保存确认，
     * 成功后同步清空 fileStore 侧打开状态（保持两侧状态一致）。
     */
    async closeFile(): Promise<boolean> {
        if (this.#openedFileId === null) return true;

        const ok = await pacStore.closeFile();
        if (!ok) return false;

        this.#openedFileId = null;
        this.#activeFileId = null;
        log.info('[FileStore] closed current file');
        return true;
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
            if (!created) return false;

            this.#tree = insertChild(this.#tree, parentPath, created);
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
            if (!created) return false;

            this.#tree = insertChild(this.#tree, parentPath, created);
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

        const oldPath = node.path;

        try {
            const result = await renameNodeApi(oldPath, trimmed);
            if (!result) return false;

            const reloaded = await this.reload();
            if (reloaded) {
                this.#reveal(result.newPath, parentPath);
            }

            // FileNode.id 与 path 同为服务端路径；同步选中态。
            // 注意：pacStore 中当前文档路径需由 pacStore 侧提供 repath 方法同步，
            // 否则“重命名已打开文件后再次保存”仍可能写回旧路径。
            if (this.#openedFileId === node.id) {
                this.#openedFileId = result.newPath;
                this.#activeFileId = result.newPath;
            }

            // 改名成功后，由这里清理编辑态；
            // 不放在 reload() 里，避免 reload 的 await 期间 UI 被提前切换、
            // 触发 Rename.Root 在保存中途被销毁的竞态。
            if (this.#renamingNodeId === node.id) {
                this.#renamingNodeId = null;
            }

            log.info(`[FileStore] renamed ${oldPath} → ${result.newPath}`);
            return true;
        } catch (err) {
            log.error('[FileStore] rename failed', err);
            return false;
        }
    }

    /**
     * 删除节点（不可恢复）。
     *
     * 顺序很重要：
     * 1. 若当前打开的文件位于被删子树内，先走 pacStore.closeFile() 完成
     *    未保存确认与导航；用户取消则整体中止，避免删除后仍持有脏文档、
     *    后续保存写回已不存在的路径。
     * 2. 调用主进程删除。
     * 3. 重新拉取文件树：以服务端结果为准，同时校验删除是否真正生效
     *    （主进程 handler 无 output，无法从返回值判断成败）。
     *
     * reload 使用 id 作为 keyed each 的键，节点被移除、其余节点复用组件实例，
     * 展开状态得以保留。
     */
    async deleteNode(node: FileNode): Promise<boolean> {
        if (!this.#tree) return false;
        // 根目录不允许删除（防御性校验，避免误删整个 PAC 目录）。
        if (!node.path || node.path === '/' || node.path === '') return false;

        const openedPath = pacStore.doc?.path ?? null;
        if (openedPath && isSameOrDescendantPath(openedPath, node.path)) {
            const closed = await pacStore.closeFile();
            if (!closed) return false;
            this.#openedFileId = null;
            this.#activeFileId = null;
        }

        try {
            await deleteNodeApi(node.path);
        } catch (err) {
            log.error('[FileStore] delete failed', err);
            return false;
        }

        if (this.#renamingNodeId === node.id) {
            this.#renamingNodeId = null;
        }

        const reloaded = await this.reload();
        if (!reloaded) {
            log.error('[FileStore] delete succeeded but tree reload failed');
            return false;
        }

        if (findNodeByPath(this.#tree!, node.path)) {
            log.error(`[FileStore] delete not applied: ${node.path}`);
            return false;
        }

        log.info(`[FileStore] deleted ${node.path}`);
        return true;
    }
}

const KEY = Symbol.for('unigen.renderer.fileStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fileStore: FileStore = ((globalThis as any)[KEY] ??= new FileStore());