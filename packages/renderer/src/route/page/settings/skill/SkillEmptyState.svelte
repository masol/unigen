<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    IconFilterOff,
    IconLoader2,
    IconPlus,
    IconSearch,
    IconSparkles,
  } from "@tabler/icons-svelte";
  import SkillMarketGuide from "./SkillMarketGuide.svelte";

  let {
    variant = "empty",
    installing = false,
    onAction,
    onOpenMarket,
  }: {
    variant?: "empty" | "filtered";
    installing?: boolean;
    onAction?: () => void;
    onOpenMarket?: (url: string) => void;
  } = $props();
</script>

{#if variant === "empty"}
  <div class="animate-fade-in space-y-8">
    <div class="flex flex-col items-center justify-center space-y-4 py-8">
      <div
        class="flex size-16 items-center justify-center rounded-2xl bg-muted"
      >
        <IconSparkles size={24} stroke={1.5} class="text-muted-foreground" />
      </div>

      <div class="space-y-1 text-center">
        <h3 class="text-lg font-medium">尚未安装技能</h3>
        <p class="text-sm text-muted-foreground">
          从市场安装技能，扩展 Agent 的能力
        </p>
      </div>

      <Button
        class="gap-2 rounded-xl"
        disabled={installing}
        aria-busy={installing}
        onclick={() => onAction?.()}
      >
        {#if installing}
          <IconLoader2 size={16} stroke={1.5} class="animate-spin" />
          安装中
        {:else}
          <IconPlus size={16} stroke={1.5} />
          安装技能
        {/if}
      </Button>
    </div>

    <SkillMarketGuide onOpen={onOpenMarket} />
  </div>
{:else}
  <div
    class="flex animate-fade-in flex-col items-center justify-center space-y-6 py-24"
  >
    <div class="flex size-16 items-center justify-center rounded-2xl bg-muted">
      <IconSearch size={24} stroke={1.5} class="text-muted-foreground" />
    </div>

    <div class="space-y-2 text-center">
      <h3 class="text-lg font-medium">未找到匹配的技能</h3>
      <p class="text-sm text-muted-foreground">尝试更换搜索关键词</p>
    </div>

    <Button class="gap-2 rounded-xl" onclick={() => onAction?.()}>
      <IconFilterOff size={16} stroke={1.5} />
      清除搜索
    </Button>
  </div>
{/if}
