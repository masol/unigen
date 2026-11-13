<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    IconBulb,
    IconFolderOpen,
    IconLibrary,
    IconPlus,
  } from "@tabler/icons-svelte";

  let {
    totalCount = 0,
    totalDocs = 0,
    onCreate,
    onShowGuide,
    onOpenDirectory,
  }: {
    totalCount?: number;
    totalDocs?: number;
    onCreate?: () => void;
    /** 打开「推荐组织方式」弹窗。 */
    onShowGuide?: () => void;
    /** 在文件管理器中打开知识库目录。 */
    onOpenDirectory?: () => void;
  } = $props();
</script>

<header class="space-y-6">
  <div class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">
          知识库
        </h1>

        <Button
          variant="ghost"
          size="icon"
          class="size-8 rounded-lg text-muted-foreground/70 transition-all duration-200 hover:text-foreground"
          aria-label="推荐组织方式"
          title="推荐组织方式"
          onclick={() => onShowGuide?.()}
        >
          <IconBulb size={16} stroke={1.5} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          class="size-8 rounded-lg text-muted-foreground/70 transition-all duration-200 hover:text-foreground"
          aria-label="打开知识库目录"
          title="打开知识库目录"
          onclick={() => onOpenDirectory?.()}
        >
          <IconFolderOpen size={16} stroke={1.5} />
        </Button>
      </div>

      <p class="text-sm text-muted-foreground">
        管理你的偏好与专属资料，AI需要时会引用这些内容
      </p>

      <div
        class="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground"
      >
        <span class="flex items-center gap-1.5">
          <IconLibrary size={14} stroke={1.5} />
          {totalCount} 个知识集
        </span>
        {#if totalDocs > 0}
          <span class="text-border">·</span>
          <span>{totalDocs} 个文档</span>
        {/if}
      </div>
    </div>

    <Button
      class="gap-2 self-start rounded-xl sm:self-auto"
      onclick={() => onCreate?.()}
    >
      <IconPlus size={16} stroke={1.5} />
      新建知识集
    </Button>
  </div>
</header>
