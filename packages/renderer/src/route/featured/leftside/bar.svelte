<script lang="ts">
  import { layoutStore } from "$lib/store/layout.svelte";
  import {
    IconArrowsMinimize,
    IconArrowsMaximize,
    IconX,
    IconChevronDown,
    IconFolderOpen,
    IconChevronRight,
    IconFolder,
    IconBrandSvelte,
    IconFileTypeTs,
    IconFileCode,
    IconSearch,
    IconGitBranch,
    IconPuzzle,
  } from "@tabler/icons-svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Button } from "$lib/components/ui/button";

  type FileNode = {
    id: string;
    name: string;
    type: "file" | "folder";
    icon?: unknown;
    children?: FileNode[];
    open?: boolean;
  };

  let fileTree: FileNode[] = $state([
    {
      id: "src",
      name: "src",
      type: "folder",
      open: true,
      children: [
        {
          id: "src/lib",
          name: "lib",
          type: "folder",
          open: false,
          children: [
            { id: "src/lib/utils.ts", name: "utils.ts", type: "file" },
            {
              id: "src/lib/components",
              name: "components",
              type: "folder",
              open: false,
              children: [
                {
                  id: "src/lib/components/Button.svelte",
                  name: "Button.svelte",
                  type: "file",
                },
              ],
            },
          ],
        },
        {
          id: "src/route",
          name: "route",
          type: "folder",
          open: true,
          children: [
            {
              id: "src/route/layout.svelte",
              name: "layout.svelte",
              type: "file",
            },
            {
              id: "src/route/page.svelte",
              name: "+page.svelte",
              type: "file",
            },
          ],
        },
        { id: "src/app.html", name: "app.html", type: "file" },
        { id: "src/App.svelte", name: "App.svelte", type: "file" },
      ],
    },
    {
      id: "static",
      name: "static",
      type: "folder",
      open: false,
      children: [
        { id: "static/favicon.png", name: "favicon.png", type: "file" },
      ],
    },
    { id: "package.json", name: "package.json", type: "file" },
    { id: "svelte.config.js", name: "svelte.config.js", type: "file" },
    { id: "tsconfig.json", name: "tsconfig.json", type: "file" },
    { id: "vite.config.ts", name: "vite.config.ts", type: "file" },
  ]);

  function toggleFolder(node: FileNode) {
    if (node.type === "folder") node.open = !node.open;
  }
</script>

<div class="flex h-full flex-col border-r border-border/50 bg-muted/20">
  <!-- Panel header -->
  {#snippet panelHeader(title: string, panel: "left" | "bottom" | "right")}
    <div
      class="flex h-9 shrink-0 items-center justify-between border-b border-border/50 px-4"
    >
      <span
        class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {title}
      </span>
      <div class="flex items-center gap-0.5">
        <button
          class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
          onclick={() => layoutStore.toggleMaximizePanel(panel)}
        >
          {#if layoutStore.maximizedPanel === panel}
            <IconArrowsMinimize class="size-3.5" />
          {:else}
            <IconArrowsMaximize class="size-3.5" />
          {/if}
        </button>
        <button
          class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
          onclick={() => layoutStore.closePanel(panel)}
        >
          <IconX class="size-3.5" />
        </button>
      </div>
    </div>
  {/snippet}

  {@render panelHeader(
    layoutStore.topActivities.find((a) => a.id === layoutStore.activeActivity)
      ?.label ?? layoutStore.activeActivity,
    "left",
  )}

  <!-- Panel content -->
  <ScrollArea class="flex-1">
    <div class="p-2">
      {#if layoutStore.activeActivity === "explorer"}
        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → FileTree.svelte]                     │ -->
        <!-- │ 职责：递归文件树组件，支持文件夹折叠展开│ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        {#snippet fileNodeSnippet(nodes: FileNode[], depth: number)}
          {#each nodes as node (node.id)}
            <button
              class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm transition-all duration-200 hover:bg-accent/60"
              style:padding-left="{depth * 12 + 8}px"
              onclick={() => toggleFolder(node)}
            >
              {#if node.type === "folder"}
                {#if node.open}
                  <IconChevronDown
                    class="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <IconFolderOpen class="size-4 shrink-0 text-primary/80" />
                {:else}
                  <IconChevronRight
                    class="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <IconFolder class="size-4 shrink-0 text-primary/80" />
                {/if}
              {:else}
                <span class="size-3.5 shrink-0"></span>
                {#if node.name.endsWith(".svelte")}
                  <IconBrandSvelte
                    class="size-4 shrink-0 text-muted-foreground"
                  />
                {:else if node.name.endsWith(".ts") || node.name.endsWith(".js")}
                  <IconFileTypeTs
                    class="size-4 shrink-0 text-muted-foreground"
                  />
                {:else}
                  <IconFileCode class="size-4 shrink-0 text-muted-foreground" />
                {/if}
              {/if}
              <span class="truncate text-xs text-foreground/90">
                {node.name}
              </span>
            </button>
            {#if node.type === "folder" && node.open && node.children}
              {@render fileNodeSnippet(node.children, depth + 1)}
            {/if}
          {/each}
        {/snippet}
        <div class="space-y-0.5">
          {@render fileNodeSnippet(fileTree, 0)}
        </div>
        <!-- ╭─── / FileTree ───╮ -->
      {:else if layoutStore.activeActivity === "search"}
        <div class="space-y-3 p-2">
          <div
            class="flex items-center gap-2 rounded-xl border border-border/50 bg-background px-3 py-1.5"
          >
            <IconSearch class="size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索"
              class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <p class="px-1 text-xs text-muted-foreground">
            输入关键词以搜索工作区中的文件
          </p>
        </div>{:else if layoutStore.activeActivity === "source-control"}
        <div class="space-y-2 p-2">
          <div class="flex items-center gap-2 px-1">
            <IconGitBranch class="size-4 text-muted-foreground" />
            <span class="text-xs text-muted-foreground">main</span>
          </div>
          <p class="px-1 text-xs text-muted-foreground">没有待提交的更改</p>
        </div>
      {:else if layoutStore.activeActivity === "debug"}
        <div class="space-y-2 p-2">
          <p class="px-1 text-xs text-muted-foreground">
            选择运行和调试配置以开始调试
          </p>
          <Button variant="outline" size="sm" class="w-full rounded-xl text-xs">
            创建 launch.json 文件
          </Button>
        </div>
      {:else if layoutStore.activeActivity === "extensions"}
        <div class="space-y-3 p-2">
          <div
            class="flex items-center gap-2 rounded-xl border border-border/50 bg-background px-3 py-1.5"
          >
            <IconSearch class="size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="在市场中搜索扩展"
              class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div class="space-y-1">
            {#each [{ name: "Svelte for VS Code", publisher: "Svelte", installed: true }, { name: "Tailwind CSS IntelliSense", publisher: "Tailwind Labs", installed: true }, { name: "Prettier", publisher: "Prettier", installed: true }] as ext (ext.name)}
              <div
                class="flex items-start gap-2.5 rounded-lg p-2 transition-all duration-200 hover:bg-accent/60"
              >
                <div
                  class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"
                >
                  <IconPuzzle class="size-4 text-primary" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-medium">
                    {ext.name}
                  </p>
                  <p class="truncate text-xs text-muted-foreground">
                    {ext.publisher}
                  </p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="p-4">
          <p class="text-xs text-muted-foreground">
            {layoutStore.activeActivity}
          </p>
        </div>
      {/if}
    </div>
  </ScrollArea>
</div>
