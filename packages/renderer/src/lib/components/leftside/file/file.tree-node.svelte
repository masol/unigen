<!-- packages/renderer/src/lib/components/leftside/file/file.tree-node.svelte -->
<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as TreeView from "$lib/components/ui/tree-view";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import {
    IconDotsVertical,
    IconEdit,
    IconFile,
    IconFilePlus,
    IconFileText,
    IconFolder,
    IconFolderOpen,
    IconFolderPlus,
    IconLoader2,
    IconPencil,
    IconTrash,
    IconX,
  } from "@tabler/icons-svelte";
  import { promptCreateName, promptRename } from "./file.prompt";
  import { fileStore } from "./file.store.svelte";
  import Self from "./file.tree-node.svelte";
  import type { FileNode } from "./file.types";

  let { node, depth = 0 }: { node: FileNode; depth?: number } = $props();

  let menuOpen = $state(false);
  let fileContextMenuOpen = $state(false);
  let folderMenuOpen = $state(false);
  let folderOpen = $state(depth === 0);

  const isOpening = $derived(fileStore.openingFileId === node.id);
  const isOpenedFile = $derived(
    node.type === "file" && fileStore.displayedOpenedFileId === node.id,
  );
  const errorCount = $derived(
    isOpenedFile && fileStore.errorCount > 0 ? fileStore.errorCount : 0,
  );
  const hasError = $derived(errorCount > 0);
  const searchQuery = $derived(fileStore.searchQuery.trim().toLowerCase());
  const isMatch = $derived(
    searchQuery.length > 0 && node.name.toLowerCase().includes(searchQuery),
  );
  const isFileMenuOpen = $derived(menuOpen || fileContextMenuOpen);

  const MENU_LABEL_MAX = 18;

  function truncateLabel(value: string, max = MENU_LABEL_MAX): string {
    const chars = Array.from(value);
    return chars.length > max ? `${chars.slice(0, max).join("")}...` : value;
  }

  const menuNodeName = $derived(truncateLabel(node.name));

  // 新建操作的落点目录：文件夹为自身，文件为所在目录。
  const parentDirPath = $derived(
    node.type === "folder" ? node.path : getParentPath(node.path),
  );
  const parentDirName = $derived(
    parentDirPath === "/"
      ? "根"
      : (parentDirPath.split("/").filter(Boolean).at(-1) ?? "根"),
  );

  const folderHeaderClass = $derived(
    [
      "min-w-0 rounded-md outline-none",
      "transition-colors duration-150 cursor-default",
      "hover:bg-primary/10 dark:hover:bg-primary/15",
      folderMenuOpen ? "bg-primary/10 dark:bg-primary/15" : "",
      isMatch
        ? "bg-primary/10 ring-1 ring-inset ring-primary/40 shadow-[inset_2px_0_0_var(--primary)] dark:bg-primary/20 dark:ring-primary/50"
        : "",
      "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 dark:focus-visible:ring-primary/50",
    ]
      .filter(Boolean)
      .join(" "),
  );

  const fileItemClass = $derived([
    "group/item flex min-w-0 items-center rounded-lg outline-none transition-colors duration-150",
    "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 dark:focus-visible:ring-primary/50",
    "hover:bg-primary/10 dark:hover:bg-primary/15",
    isMatch
      ? "bg-primary/10 ring-1 ring-inset ring-primary/40 shadow-[inset_2px_0_0_var(--primary)] dark:bg-primary/20 dark:ring-primary/50"
      : isFileMenuOpen
        ? "bg-primary/10 dark:bg-primary/15"
        : "",
  ]);

  const openedFileIconClass = $derived(
    hasError
      ? "size-4 text-destructive"
      : "size-4 text-emerald-600 dark:text-emerald-400",
  );

  const shouldForceOpen = $derived.by(() => {
    if (!searchQuery) return false;
    if (node.type !== "folder") return false;
    return subtreeContainsMatch(node, searchQuery);
  });

  function subtreeContainsMatch(n: FileNode, query: string): boolean {
    if (n.name.toLowerCase().includes(query)) return true;
    return (n.children ?? []).some((c) => subtreeContainsMatch(c, query));
  }

  $effect(() => {
    if (node.type !== "folder") return;
    if (fileStore.shouldExpandFolder(node.path)) {
      folderOpen = true;
    }
  });

  function getParentPath(path: string): string {
    const idx = path.lastIndexOf("/");
    return idx <= 0 ? "/" : path.slice(0, idx);
  }

  async function handleRename() {
    if (!node.name) return;
    const parentPath = getParentPath(node.path);
    const newName = await promptRename(node, parentPath);
    if (newName && newName !== node.name) {
      await fileStore.renameNode(node, newName);
    }
  }

  function handleFileClick(e: MouseEvent) {
    if (node.type !== "file") return;
    e.stopPropagation();
  }

  async function handleFileDblClick(e: MouseEvent) {
    if (node.type !== "file") return;
    e.preventDefault();
    e.stopPropagation();
    await fileStore.openFile(node);
  }

  function handleFileKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void fileStore.openFile(node);
    }
  }

  function handleFolderClick(e: MouseEvent) {
    if (node.type !== "folder") return;
    e.stopPropagation();
  }

  async function handleDelete() {
    const isFolder = node.type === "folder";
    const childCount = isFolder ? (node.children?.length ?? 0) : 0;
    const message = isFolder
      ? childCount > 0
        ? `删除「${node.name}」后，其中的 ${childCount} 个项目将一并移除。确定继续吗？`
        : `确定删除文件夹「${node.name}」吗？`
      : `确定删除「${node.name}」吗？`;

    const confirmed = await confirmStore.request({
      title: isFolder ? "删除文件夹" : "删除文件",
      message,
      variant: "question",
    });
    if (!confirmed) return;

    console.info("[FileTreeNode] delete not implemented in mock:", node.path);
  }

  async function handleContextAction(action: string) {
    const targetPath =
      node.type === "folder" ? node.path : getParentPath(node.path);
    if (action === "open") {
      if (node.type === "file") await fileStore.openFile(node);
    } else if (action === "close") {
      await fileStore.closeFile();
    } else if (action === "rename") {
      await handleRename();
    } else if (action === "new-file") {
      const name = await promptCreateName("file", targetPath);
      if (name) await fileStore.createFile(targetPath, name);
    } else if (action === "new-folder") {
      const name = await promptCreateName("folder", targetPath);
      if (name) await fileStore.createFolder(targetPath, name);
    } else if (action === "delete") {
      await handleDelete();
    }
  }
</script>

{#snippet folderIcon({ open }: { name: string; open: boolean })}
  {#if open}
    <IconFolderOpen
      class="size-4 text-amber-500 dark:text-amber-400"
      stroke={1.75}
    />
  {:else}
    <IconFolder
      class="size-4 text-amber-500 dark:text-amber-400"
      stroke={1.75}
    />
  {/if}
{/snippet}

{#if node.type === "folder"}
  <div
    role="presentation"
    data-tree-node
    data-node-type="folder"
    data-node-id={node.id}
    data-node-path={node.path}
    onclick={handleFolderClick}
  >
    <ContextMenu.Root bind:open={folderMenuOpen}>
      <ContextMenu.Trigger>
        {#snippet child({ props })}
          <div {...props} role="presentation">
            <TreeView.Folder
              name={node.name}
              bind:open={folderOpen}
              forceOpen={shouldForceOpen}
              icon={folderIcon}
              class={folderHeaderClass}
            >
              {#each node.children ?? [] as child (child.id)}
                <Self node={child} depth={depth + 1} />
              {/each}
            </TreeView.Folder>
          </div>
        {/snippet}
      </ContextMenu.Trigger>
      <ContextMenu.Content class="w-44">
        <ContextMenu.Item
          onSelect={() => handleContextAction("rename")}
          class="gap-2 text-xs"
        >
          <IconPencil class="size-3.5" stroke={1.5} />
          重命名
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item
          onSelect={() => handleContextAction("new-file")}
          class="gap-2 text-xs"
        >
          <IconFilePlus class="size-3.5" stroke={1.5} />
          <span class="min-w-0 truncate" title={node.name}>
            新建文件于 {menuNodeName}
          </span>
        </ContextMenu.Item>
        <ContextMenu.Item
          onSelect={() => handleContextAction("new-folder")}
          class="gap-2 text-xs"
        >
          <IconFolderPlus class="size-3.5" stroke={1.5} />
          <span class="min-w-0 truncate" title={node.name}>
            新建文件夹于 {menuNodeName}
          </span>
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item
          onSelect={() => handleContextAction("delete")}
          variant="destructive"
          class="gap-2 text-xs"
        >
          <IconTrash class="size-3.5" stroke={1.5} />
          <span class="min-w-0 truncate" title={node.name}>
            删除 {menuNodeName}
          </span>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  </div>
{:else}
  <ContextMenu.Root bind:open={fileContextMenuOpen}>
    <ContextMenu.Trigger>
      {#snippet child({ props })}
        <div
          {...props}
          class={fileItemClass}
          role="button"
          tabindex="0"
          aria-busy={isOpening}
          data-tree-node
          data-node-type="file"
          data-node-id={node.id}
          data-node-path={node.path}
          onclick={handleFileClick}
          ondblclick={handleFileDblClick}
          onkeydown={handleFileKeydown}
        >
          <!-- 文件名区域：min-w-0 允许收缩，truncate 禁止换行并裁剪溢出 -->
          <div class="min-w-0 flex-1 truncate">
            <TreeView.File name={node.name} tabindex={-1} class="min-w-0">
              {#snippet icon(_args)}
                {#if isOpening}
                  <IconLoader2
                    class="size-4 animate-spin text-primary"
                    stroke={1.5}
                  />
                {:else if isOpenedFile}
                  <IconFileText class={openedFileIconClass} stroke={2} />
                {:else}
                  <IconFile
                    class="size-4 text-muted-foreground"
                    stroke={1.75}
                  />
                {/if}
              {/snippet}
            </TreeView.File>
          </div>

          {#if hasError}
            <span
              class="ml-1 inline-flex min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-white"
              title={`${errorCount} 个错误`}
            >
              {errorCount > 99 ? "99+" : errorCount}
            </span>
          {/if}

          <DropdownMenu.Root bind:open={menuOpen}>
            <DropdownMenu.Trigger>
              {#snippet child({ props: dp })}
                <button
                  {...dp}
                  type="button"
                  aria-label="文件操作"
                  class={[
                    "ml-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity duration-150 hover:bg-accent hover:text-foreground",
                    menuOpen
                      ? "opacity-100"
                      : "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                  ]}
                  onclick={(e) => e.stopPropagation()}
                >
                  <IconDotsVertical class="size-3.5" stroke={1.5} />
                </button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" sideOffset={4} class="w-36">
              <DropdownMenu.Item
                onSelect={() => handleContextAction("rename")}
                class="gap-2 text-xs"
              >
                <IconEdit class="size-3.5" stroke={1.5} />
                重命名
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                onSelect={() => handleContextAction("delete")}
                variant="destructive"
                class="gap-2 text-xs"
              >
                <IconTrash class="size-3.5" stroke={1.5} />
                <span class="min-w-0 truncate" title={node.name}>
                  删除 {menuNodeName}
                </span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      {/snippet}
    </ContextMenu.Trigger>
    <ContextMenu.Content class="w-44">
      {#if isOpenedFile}
        <ContextMenu.Item
          onSelect={() => handleContextAction("close")}
          class="gap-2 text-xs"
        >
          <IconX class="size-3.5" stroke={1.5} />
          关闭
        </ContextMenu.Item>
      {:else}
        <ContextMenu.Item
          onSelect={() => handleContextAction("open")}
          class="gap-2 text-xs"
        >
          <IconFileText class="size-3.5" stroke={1.5} />
          打开
        </ContextMenu.Item>
      {/if}
      <ContextMenu.Separator />
      <ContextMenu.Item
        onSelect={() => handleContextAction("rename")}
        class="gap-2 text-xs"
      >
        <IconEdit class="size-3.5" stroke={1.5} />
        重命名
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item
        onSelect={() => handleContextAction("new-file")}
        class="gap-2 text-xs"
      >
        <IconFilePlus class="size-3.5" stroke={1.5} />
        <span class="min-w-0 truncate" title={parentDirPath}>
          新建文件于 {parentDirName}
        </span>
      </ContextMenu.Item>
      <ContextMenu.Item
        onSelect={() => handleContextAction("new-folder")}
        class="gap-2 text-xs"
      >
        <IconFolderPlus class="size-3.5" stroke={1.5} />
        <span class="min-w-0 truncate" title={parentDirPath}>
          新建文件夹于 {parentDirName}
        </span>
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item
        onSelect={() => handleContextAction("delete")}
        variant="destructive"
        class="gap-2 text-xs"
      >
        <IconTrash class="size-3.5" stroke={1.5} />
        <span class="min-w-0 truncate" title={node.name}>
          删除 {menuNodeName}
        </span>
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Root>
{/if}
