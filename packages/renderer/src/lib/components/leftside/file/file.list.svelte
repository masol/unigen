<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as TreeView from "$lib/components/ui/tree-view";
  import {
    IconFilePlus,
    IconFileText,
    IconFolderPlus,
    IconLoader2,
    IconRefresh,
  } from "@tabler/icons-svelte";
  import { onMount, tick } from "svelte";
  import { promptCreateName } from "./file.prompt";
  import { fileStore } from "./file.store.svelte";
  import FileTreeNode from "./file.tree-node.svelte";

  onMount(() => {
    fileStore.load();
  });

  let creatingIndex = $state(false);

  /** 空态一键创建：根目录下直接生成 index.md，不弹命名对话框。 */
  async function handleCreateIndexFile() {
    if (creatingIndex || !fileStore.tree) return;
    creatingIndex = true;
    try {
      // 空目录下不存在同名冲突；失败由 store 内部日志兜底
      await fileStore.createFile("/", "index.md");
    } finally {
      creatingIndex = false;
    }
  }

  function getVisibleNodes(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>("[data-tree-node]"),
    ).filter((el) => el.offsetParent !== null);
  }

  function focusNode(wrapper: HTMLElement) {
    const target =
      wrapper.tabIndex >= 0
        ? wrapper
        : wrapper.querySelector<HTMLElement>('button, [tabindex="0"]');
    target?.focus();
    target?.scrollIntoView({ block: "nearest" });
  }

  function isExpanded(wrapper: HTMLElement): boolean {
    const trigger = wrapper.querySelector<HTMLElement>("button");
    return trigger?.getAttribute("aria-expanded") === "true";
  }

  function handleTreeKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const container = e.currentTarget as HTMLElement;
    const active = document.activeElement as HTMLElement | null;
    if (!active) return;
    const current = active.closest<HTMLElement>("[data-tree-node]");
    if (!current) return;

    const nodes = getVisibleNodes(container);
    const idx = nodes.indexOf(current);
    if (idx < 0) return;

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const next = nodes[Math.min(idx + 1, nodes.length - 1)];
        if (next && next !== current) focusNode(next);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = nodes[Math.max(idx - 1, 0)];
        if (prev && prev !== current) focusNode(prev);
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        if (current.dataset.nodeType !== "folder") break;
        if (!isExpanded(current)) {
          current.querySelector<HTMLButtonElement>("button")?.click();
        } else {
          const firstChild =
            current.querySelector<HTMLElement>("[data-tree-node]");
          if (firstChild) focusNode(firstChild);
        }
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        if (current.dataset.nodeType === "folder" && isExpanded(current)) {
          current.querySelector<HTMLButtonElement>("button")?.click();
          break;
        }
        const parent =
          current.parentElement?.closest<HTMLElement>("[data-tree-node]");
        if (parent) focusNode(parent);
        break;
      }
    }
  }

  async function handleCreateFile() {
    const name = await promptCreateName("file", "/");
    if (name) await fileStore.createFile("/", name);
  }

  async function handleCreateFolder() {
    const name = await promptCreateName("folder", "/");
    if (name) await fileStore.createFolder("/", name);
  }

  // 新建/重命名后：展开父文件夹 + 滚动到目标节点
  $effect(() => {
    const id = fileStore.revealNodeId;
    if (!id) return;
    tick().then(() => {
      if (fileStore.revealNodeId !== id) return;
      requestAnimationFrame(() => {
        if (fileStore.revealNodeId !== id) return;
        const el = document.querySelector<HTMLElement>(
          `[data-node-id="${CSS.escape(id)}"]`,
        );
        if (el) {
          el.scrollIntoView({ block: "nearest" });
          const focusable =
            el.tabIndex >= 0
              ? el
              : el.querySelector<HTMLElement>("[tabindex], button");
          focusable?.focus({ preventScroll: true });
        }
        fileStore.clearReveal();
      });
    });
  });
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → FileEmptyState.svelte]              │ -->
<!-- │ 职责：文件树为空时展示图标、说明与一键新建 index.md │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
{#snippet emptyPlaceholder()}
  <div
    class="flex h-full min-h-64 flex-col items-center justify-center gap-5 px-6 text-center animate-fade-in"
  >
    <div class="flex size-14 items-center justify-center rounded-2xl bg-muted">
      <IconFileText class="size-6 text-muted-foreground" stroke={1.5} />
    </div>
    <div class="space-y-1.5">
      <p class="text-sm font-medium text-foreground">无工作指南</p>
      <p class="text-xs text-muted-foreground">
        立即创建一个 index.md 开始
      </p>
    </div>
    <Button
      variant="outline"
      size="sm"
      class="h-8 gap-1.5 rounded-xl text-xs"
      disabled={creatingIndex || !fileStore.tree}
      onclick={handleCreateIndexFile}
    >
      {#if creatingIndex}
        <IconLoader2 class="size-3.5 animate-spin" stroke={1.5} />
        正在创建…
      {:else}
        <IconFilePlus class="size-3.5" stroke={1.5} />
        立即新建
      {/if}
    </Button>
  </div>
{/snippet}
<!-- ╭─── / FileEmptyState ───╮ -->

<div class="flex h-full min-w-0 flex-col">
  <nav class="min-w-0 flex-1 overflow-hidden">
    {#if fileStore.isLoading && !fileStore.tree}
      <div class="h-full overflow-y-auto overflow-x-hidden px-3 py-3">
        <div class="space-y-3 animate-fade-in">
          {#each [1, 2, 3] as _i (_i)}
            <div class="space-y-2">
              <Skeleton class="h-5 w-24 rounded-lg" />
              <Skeleton class="ml-4 h-9 w-full rounded-xl" />
              <Skeleton class="ml-4 h-9 w-full rounded-xl" />
            </div>
          {/each}
        </div>
      </div>
    {:else if fileStore.error}
      <div
        class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p class="text-sm text-muted-foreground">{fileStore.error}</p>
        <Button
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 rounded-xl text-xs"
          onclick={() => fileStore.reload()}
        >
          <IconRefresh class="size-3.5" stroke={1.5} />
          重试
        </Button>
      </div>
    {:else if !fileStore.tree}
      {@render emptyPlaceholder()}
    {:else}
      {@const tree = fileStore.tree!}
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          {#snippet child({ props })}
            <div
              {...props}
              class="h-full min-w-0 overflow-x-hidden overflow-y-auto px-3 py-2 animate-fade-in"
              role="presentation"
              oncontextmenu={(e) => {
                // 空白区右键：打开外层菜单；节点内右键：交给节点自己的 ContextMenu。
                if ((e.target as HTMLElement).closest("[data-tree-node]")) {
                  return;
                }
                const fn = props.oncontextmenu as unknown as
                  | ((ev: MouseEvent) => void)
                  | undefined;
                fn?.(e);
              }}
              onkeydown={handleTreeKeydown}
            >
              <TreeView.Root class="h-full">
                {#if (tree.children?.length ?? 0) === 0}
                  {@render emptyPlaceholder()}
                {:else}
                  {#each tree.children ?? [] as child (child.id)}
                    <FileTreeNode node={child} />
                  {/each}
                {/if}
              </TreeView.Root>
            </div>
          {/snippet}
        </ContextMenu.Trigger>
        <ContextMenu.Content class="w-44">
          <ContextMenu.Item onSelect={handleCreateFile} class="gap-2 text-xs">
            <IconFilePlus class="size-3.5" stroke={1.5} />
            在根下新建文件
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={handleCreateFolder} class="gap-2 text-xs">
            <IconFolderPlus class="size-3.5" stroke={1.5} />
            在根下新建文件夹
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    {/if}
  </nav>
</div>
