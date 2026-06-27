<!-- NovelToVideoDashboard/InfoBlocksGrid.svelte -->
<!-- 职责：三宫格信息卡（输入 / 要求 / 输出）入口。点击通过 store 通知外部。 -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import {
    IconChevronRight,
    IconCircleCheckFilled,
  } from "@tabler/icons-svelte";
  import { dashboardStore, type InfoBlock } from "./dashboard.svelte";
</script>

<div class="grid grid-cols-1 gap-6 md:grid-cols-3 animate-fade-in">
  {#each dashboardStore.infoBlocks as block (block.key)}
    <button
      type="button"
      onclick={() => dashboardStore.openPanel(block.key)}
      class="group flex flex-col gap-5 rounded-2xl border border-border/50 bg-card p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div class="flex items-start justify-between">
        <div
          class="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
        >
          <block.icon size={20} stroke={1.5} />
        </div>
        <Badge
          variant="outline"
          class={[
            "rounded-lg border-border/50 px-2 py-0.5 text-[10px] font-medium",
            block.metaTone === "ready"
              ? "text-emerald-600 dark:text-emerald-500"
              : "text-muted-foreground",
          ]}
        >
          {#if block.metaTone === "ready"}
            <IconCircleCheckFilled size={12} stroke={1.5} class="mr-1" />
          {/if}
          {block.metaLabel}
        </Badge>
      </div>

      <div class="space-y-2">
        <div class="flex items-baseline gap-2">
          <h3 class="text-lg font-medium">{block.title}</h3>
          <span class="text-xs text-muted-foreground">{block.subtitle}</span>
        </div>
        <p class="text-sm leading-relaxed text-foreground">
          {block.summary}
        </p>
      </div>

      <div
        class="mt-auto flex items-center justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground"
      >
        <span>点击进行配置</span>
        <IconChevronRight
          size={16}
          stroke={1.5}
          class="transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </div>
    </button>
  {/each}
</div>
