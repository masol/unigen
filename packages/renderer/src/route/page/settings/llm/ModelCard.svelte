<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { IconPencil, IconStar, IconTrash } from "@tabler/icons-svelte";

  import { DefInputToken, DefOutputToken } from "$lib/store/config.svelte";
  import {
    formatTokens,
    type Model,
    tagIcons,
    tagLabels,
  } from "$lib/utils/model/types";

  let {
    model,
    disabled = false,
    onRemove,
    onEdit,
  }: {
    model: Model;
    disabled?: boolean;
    onRemove?: () => void;
    onEdit?: () => void;
  } = $props();
</script>

<div
  class={[
    "group relative space-y-3 rounded-xl border p-4 transition-all duration-200",
    disabled
      ? "pointer-events-none border-border/30 bg-muted/40 opacity-50 saturate-0"
      : "border-border/50 bg-background hover:border-border hover:shadow-lg",
  ]}
>
  <!-- 标题行 -->
  <div class="flex items-start justify-between gap-2">
    <div class="min-w-0 space-y-0.5">
      <p class="truncate text-sm font-medium">
        {model.id}
      </p>
    </div>

    <div
      class="flex shrink-0 items-center gap-0.5 opacity-0 transition-all duration-200 group-hover:opacity-100"
    >
      <Button
        variant="ghost"
        size="icon"
        class="size-7 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        onclick={(e: MouseEvent) => {
          e.stopPropagation();
          onEdit?.();
        }}
      >
        <IconPencil size={14} stroke={1.5} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-7 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onclick={(e: MouseEvent) => {
          e.stopPropagation();
          onRemove?.();
        }}
      >
        <IconTrash size={14} stroke={1.5} />
      </Button>
    </div>
  </div>

  <!-- 能力标签 -->
  {#if model.abilities.length > 0}
    <div class="flex flex-wrap gap-1.5">
      {#each model.abilities as ability (ability)}
        {@const AbilityIcon = tagIcons[ability]}
        <Badge variant="secondary" class="gap-1 rounded-lg px-2 py-0.5 text-xs">
          <AbilityIcon size={12} stroke={1.5} />
          {tagLabels[ability]}
        </Badge>
      {/each}
    </div>
  {/if}

  <!-- 上下文窗口 + 评分 -->
  <div class="flex items-center justify-between gap-3 text-xs">
    <div class="flex items-center gap-2.5 text-muted-foreground">
      <span title="最大输入"
        >↑ {formatTokens(model.inctx ?? DefInputToken)}</span
      >
      <span title="最大输出"
        >↓ {formatTokens(model.outctx ?? DefOutputToken)}</span
      >
    </div>

    <div class="flex shrink-0 items-center gap-1 text-muted-foreground">
      <IconStar size={12} stroke={1.5} class="text-primary" />
      <span class="font-medium">{model.score ?? 50}</span>
    </div>
  </div>
</div>
