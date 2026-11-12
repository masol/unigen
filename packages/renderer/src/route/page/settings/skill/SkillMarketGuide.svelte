<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { IconExternalLink, IconWorld } from "@tabler/icons-svelte";
  import { SKILL_MARKETS } from "./skillMarkets";

  let {
    onOpen,
    dense = false,
  }: {
    onOpen?: (url: string) => void;
    dense?: boolean;
  } = $props();
</script>

<div class="space-y-4">
  <div class="space-y-1">
    <div class="flex items-center gap-2">
      <IconWorld size={16} stroke={1.5} class="text-primary" />
      <h3 class="text-lg font-medium">常见技能市场</h3>
    </div>
    <p class="text-sm text-muted-foreground">
      需要安装技能？可以从以下市场发现和安装。
    </p>
  </div>

  <div
    class={[
      "grid gap-3",
      dense ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3",
    ]}
  >
    {#each SKILL_MARKETS as market (market.id)}
      <button
        type="button"
        class="group flex h-full flex-col rounded-2xl border border-border/50 bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
        onclick={() => onOpen?.(market.url)}
      >
        <div class="flex items-start justify-between gap-2">
          <span class="text-sm font-medium">{market.name}</span>
          <IconExternalLink
            size={14}
            stroke={1.5}
            class="mt-0.5 shrink-0 text-muted-foreground/50 transition-colors duration-200 group-hover:text-primary"
          />
        </div>

        <p
          class="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground"
        >
          {market.description}
        </p>

        <div class="mt-auto flex flex-wrap gap-1.5 pt-3">
          {#each market.tags as tag (tag)}
            <Badge
              variant="secondary"
              class="rounded-lg text-[11px] font-normal"
            >
              {tag}
            </Badge>
          {/each}
        </div>
      </button>
    {/each}
  </div>
</div>
