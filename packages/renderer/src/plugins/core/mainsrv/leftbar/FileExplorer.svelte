<script lang="ts">
  import {
    IconChevronDown,
    IconFolderOpen,
    IconChevronRight,
    IconFolder,
    IconBrandSvelte,
    IconFileTypeTs,
    IconFileCode,
  } from "@tabler/icons-svelte";

  type FileNode = {
    id: string;
    name: string;
    type: "file" | "folder";
    children?: FileNode[];
    open?: boolean;
  };

  let {
    tree = $bindable([
      {
        id: "src",
        name: "src",
        type: "folder" as const,
        open: true,
        children: [
          {
            id: "src/lib",
            name: "lib",
            type: "folder" as const,
            open: false,
            children: [
              {
                id: "src/lib/utils.ts",
                name: "utils.ts",
                type: "file" as const,
              },
              {
                id: "src/lib/components",
                name: "components",
                type: "folder" as const,
                open: false,
                children: [
                  {
                    id: "src/lib/components/Button.svelte",
                    name: "Button.svelte",
                    type: "file" as const,
                  },
                ],
              },
            ],
          },
          {
            id: "src/routes",
            name: "routes",
            type: "folder" as const,
            open: true,
            children: [
              {
                id: "src/routes/layout.svelte",
                name: "+layout.svelte",
                type: "file" as const,
              },
              {
                id: "src/routes/page.svelte",
                name: "+page.svelte",
                type: "file" as const,
              },
            ],
          },
          { id: "src/app.html", name: "app.html", type: "file" as const },
          { id: "src/App.svelte", name: "App.svelte", type: "file" as const },
        ],
      },
      {
        id: "static",
        name: "static",
        type: "folder" as const,
        open: false,
        children: [
          {
            id: "static/favicon.png",
            name: "favicon.png",
            type: "file" as const,
          },
        ],
      },
      { id: "package.json", name: "package.json", type: "file" as const },
      {
        id: "svelte.config.js",
        name: "svelte.config.js",
        type: "file" as const,
      },
      { id: "tsconfig.json", name: "tsconfig.json", type: "file" as const },
      { id: "vite.config.ts", name: "vite.config.ts", type: "file" as const },
    ]),
    onFileClick = (node: FileNode) => {
      void node;
    },
    onFolderToggle = (node: FileNode) => {
      void node;
    },
  }: {
    tree?: FileNode[];
    onFileClick?: (node: FileNode) => void;
    onFolderToggle?: (node: FileNode) => void;
  } = $props();

  function handleNodeClick(node: FileNode) {
    if (node.type === "folder") {
      node.open = !node.open;
      onFolderToggle(node);
    } else {
      onFileClick(node);
    }
  }

  function getFileIcon(fileName: string) {
    if (fileName.endsWith(".svelte")) {
      return IconBrandSvelte;
    } else if (fileName.endsWith(".ts") || fileName.endsWith(".js")) {
      return IconFileTypeTs;
    } else {
      return IconFileCode;
    }
  }
</script>

<div class="w-full space-y-0.5">
  {#snippet fileNodeSnippet(nodes: FileNode[], depth: number)}
    {#each nodes as node (node.id)}
      <button
        class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm transition-all duration-200 hover:bg-accent/60"
        style:padding-left="{depth * 12 + 8}px"
        onclick={() => handleNodeClick(node)}
      >
        {#if node.type === "folder"}
          {#if node.open}
            <IconChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
            <IconFolderOpen class="size-4 shrink-0 text-primary/80" />
          {:else}
            <IconChevronRight class="size-3.5 shrink-0 text-muted-foreground" />
            <IconFolder class="size-4 shrink-0 text-primary/80" />
          {/if}
        {:else}
          <span class="size-3.5 shrink-0"></span>
          {@const FileIcon = getFileIcon(node.name)}
          <FileIcon class="size-4 shrink-0 text-muted-foreground" />
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

  {@render fileNodeSnippet(tree, 0)}
</div>
