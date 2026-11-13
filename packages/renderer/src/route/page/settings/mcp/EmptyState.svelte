<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    IconFilterOff,
    IconPlugConnected,
    IconPlus,
    IconSearch,
  } from "@tabler/icons-svelte";
  import McpMarketGuide from "./McpMarketGuide.svelte";

  let {
    variant = "empty", // "empty" | "filtered"
    onAction,
    onOpenMarket,
  }: {
    variant?: "empty" | "filtered";
    onAction?: () => void;
    onOpenMarket?: (url: string) => void;
  } = $props();
</script>

{#if variant === "empty"}
  <div class="animate-fade-in space-y-8">
    <div class="flex flex-col items-center justify-center space-y-6 py-8">
      <div
        class="flex size-16 items-center justify-center rounded-2xl bg-muted"
      >
        <IconPlugConnected
          size={24}
          stroke={1.5}
          class="text-muted-foreground"
        />
      </div>

      <div class="space-y-2 text-center">
        <h3 class="text-lg font-medium">尚未配置 MCP 服务</h3>
        <p class="text-sm text-muted-foreground">
          添加 MCP 服务以扩展模型可用的工具集
        </p>
      </div>

      <Button class="gap-2 rounded-xl" onclick={() => onAction?.()}>
        <IconPlus size={16} stroke={1.5} />
        添加 MCP 服务
      </Button>
    </div>

    <McpMarketGuide onOpen={onOpenMarket} />
  </div>
{:else}
  <div
    class="flex animate-fade-in flex-col items-center justify-center space-y-6 py-24"
  >
    <div class="flex size-16 items-center justify-center rounded-2xl bg-muted">
      <IconSearch size={24} stroke={1.5} class="text-muted-foreground" />
    </div>

    <div class="space-y-2 text-center">
      <h3 class="text-lg font-medium">未找到匹配的 MCP 服务</h3>
      <p class="text-sm text-muted-foreground">
        尝试更换搜索关键词或调整筛选条件
      </p>
    </div>

    <Button class="gap-2 rounded-xl" onclick={() => onAction?.()}>
      <IconFilterOff size={16} stroke={1.5} />
      清除全部筛选
    </Button>
  </div>
{/if}
