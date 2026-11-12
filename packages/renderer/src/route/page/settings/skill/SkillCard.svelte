<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { safeApi } from "$lib/utils/api";
  import type { SkillSearchItem } from "@app/main/types";
  import { IconFolderOpen, IconLoader2, IconTrash } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";

  let {
    skill,
    removing = false,
    onRemove,
  }: {
    skill: SkillSearchItem;
    removing?: boolean;
    onRemove?: () => void;
  } = $props();

  const source = $derived.by(() => {
    const value = skill.metadata?.source;
    return typeof value === "string" && value.trim() ? value : null;
  });

  async function openFolder() {
    try {
      await safeApi().system.showItemInFolder({ path: skill.path });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "打开技能目录失败");
    }
  }
</script>

<article
  class="group flex h-full flex-col rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md has-focus-visible:-translate-y-0.5 has-focus-visible:shadow-md"
>
  <div class="min-w-0">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <h3 class="truncate text-lg font-medium">{skill.name}</h3>
      {#if source}
        <Badge variant="secondary" class="rounded-lg text-xs">
          {source}
        </Badge>
      {/if}
    </div>

    <p class="mt-2 line-clamp-3 text-sm text-muted-foreground">
      {skill.description || "暂无描述"}
    </p>
  </div>

  <div class="mt-auto flex items-center justify-between gap-3 pt-4">
    <div class="flex min-w-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        class="size-7 shrink-0 rounded-lg text-muted-foreground/70 hover:text-foreground"
        aria-label="在文件夹中显示"
        title={skill.path}
        onclick={() => void openFolder()}
      >
        <IconFolderOpen size={14} stroke={1.5} />
      </Button>
      <span
        class="truncate font-mono text-xs text-muted-foreground/60"
        title={skill.id}
      >
        {skill.id}
      </span>
    </div>

    <Button
      variant="ghost"
      size="sm"
      class="shrink-0 gap-1.5 rounded-xl text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
      disabled={removing}
      onclick={() => onRemove?.()}
    >
      {#if removing}
        <IconLoader2 size={14} stroke={1.5} class="animate-spin" />
        卸载中
      {:else}
        <IconTrash size={14} stroke={1.5} />
        卸载
      {/if}
    </Button>
  </div>
</article>
