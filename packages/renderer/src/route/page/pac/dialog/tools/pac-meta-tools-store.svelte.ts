// 可复用的检索状态管理
import { fileStore } from "$lib/components/leftside/file/file.store.svelte";
import type { FileNode } from "$lib/components/leftside/file/file.types";
import { safeApi } from "$lib/utils/api";

export type PickerItem = {
    id: string;
    name?: string;
    title?: string;
    label?: string;
    description?: string;
    desc?: string;
};

export type PickerLoader = (
    query: string,
    offset: number,
) => Promise<{ items: PickerItem[]; hasMore: boolean }>;

export class PickerSource {
    items = $state<PickerItem[]>([]);
    loading = $state(false);
    loadingMore = $state(false);
    error = $state<string | null>(null);
    hasMore = $state(false);
    query = $state("");
    loadedOnce = $state(false);

    #loader: PickerLoader;
    #seq = 0;
    #timer: ReturnType<typeof setTimeout> | undefined = undefined;

    constructor(loader: PickerLoader) {
        this.#loader = loader;
    }

    async reload(): Promise<void> {
        const seq = ++this.#seq;
        this.loading = true;
        this.error = null;
        try {
            const result = await this.#loader(this.query.trim(), 0);
            if (seq !== this.#seq) return;
            this.items = result.items.slice();
            this.hasMore = result.hasMore;
            this.loadedOnce = true;
        } catch (err) {
            if (seq !== this.#seq) return;
            this.error = err instanceof Error ? err.message : "加载失败";
        } finally {
            if (seq === this.#seq) this.loading = false;
        }
    }

    async loadMore(): Promise<void> {
        if (!this.hasMore || this.loading || this.loadingMore) return;
        const seq = this.#seq;
        this.loadingMore = true;
        try {
            const result = await this.#loader(this.query.trim(), this.items.length);
            if (seq !== this.#seq) return;
            this.items = [...this.items, ...result.items];
            this.hasMore = result.hasMore;
        } catch (err) {
            if (seq !== this.#seq) return;
            this.error = err instanceof Error ? err.message : "加载更多失败";
        } finally {
            this.loadingMore = false;
        }
    }

    setQuery(next: string): void {
        this.query = next;
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = setTimeout(() => {
            this.#timer = undefined;
            void this.reload();
        }, 200);
    }

    dispose(): void {
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = undefined;
    }
}

// 创建各类型的 PickerSource
const PAGE_SIZE = 30;

export function createSkillsSource(): PickerSource {
    return new PickerSource(async (query, offset) => {
        const result = await safeApi().agent.searchSkills({
            query,
            limit: PAGE_SIZE,
            offset,
        });
        return {
            items: (result?.items ?? []) as PickerItem[],
            hasMore: result?.hasMore ?? false,
        };
    });
}

export function createToolsSource(): PickerSource {
    return new PickerSource(async (query, offset) => {
        const result = await safeApi().agent.searchTools({
            query,
            limit: PAGE_SIZE,
            offset,
        });
        return {
            items: (result?.items ?? []) as PickerItem[],
            hasMore: result?.hasMore ?? false,
        };
    });
}

export function createAgentsSource(currentPath: string): PickerSource {
    return new PickerSource(async (query) => {
        let tree = fileStore.tree;
        if (!tree && !fileStore.isLoading) {
            await fileStore.reload();
            tree = fileStore.tree;
        }

        const current = currentPath.trim();
        const all = collectMarkdownFiles(tree)
            .filter((node) => node.path !== current)
            .map((node) => {
                const id = normalizeAgentPath(current, node.path);
                return {
                    id,
                    name: id,
                    description: node.path,
                };
            })
            .sort((a, b) => a.id.localeCompare(b.id));

        const term = query.trim().toLowerCase();
        const items = term
            ? all.filter(
                (it) =>
                    it.id.toLowerCase().includes(term) ||
                    (it.description ?? "").toLowerCase().includes(term),
            )
            : all;
        return { items, hasMore: false };
    });
}

function splitPath(path: string): string[] {
    return path.split("/").filter(Boolean);
}

function relativePath(fromFile: string, targetFile: string): string {
    const fromDir = splitPath(fromFile).slice(0, -1);
    const to = splitPath(targetFile);
    let i = 0;
    while (i < fromDir.length && i < to.length && fromDir[i] === to[i]) i += 1;
    const parts = [
        ...Array<string>(fromDir.length - i).fill(".."),
        ...to.slice(i),
    ];
    const rel = parts.join("/");
    return rel.startsWith(".") ? rel : `./${rel}`;
}

function canonicalizeRelativePath(path: string): string {
    if (
        path === "." ||
        path === ".." ||
        path.startsWith("./") ||
        path.startsWith("../")
    ) {
        return path;
    }
    return `./${path}`;
}

/**
 * 将 Agent path 规范化为选择器可匹配的形式：
 * - 绝对路径：基于当前 PAC 文件转成相对路径；
 * - 相对路径：补齐 `./` 前缀，保持“相对于当前文件”的语义。
 */
export function normalizeAgentPath(currentPath: string, path: string): string {
    const trimmed = path.trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith("/")) {
        const base = currentPath.trim();
        return base ? relativePath(base, trimmed) : trimmed;
    }
    return canonicalizeRelativePath(trimmed);
}

function collectMarkdownFiles(root: FileNode | null): FileNode[] {
    if (!root) return [];

    const files: FileNode[] = [];
    const stack: FileNode[] = [root];

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;

        if (node.type === "file") {
            if (node.name.endsWith(".md")) files.push(node);
            continue;
        }

        const children = node.children ?? [];
        for (let i = children.length - 1; i >= 0; i -= 1) {
            stack.push(children[i]);
        }
    }

    return files;
}