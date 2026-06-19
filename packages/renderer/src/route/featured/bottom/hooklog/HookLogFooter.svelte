<script lang="ts">
  import { Separator } from "$lib/components/ui/separator";
  import { IconWifi, IconWifiOff } from "@tabler/icons-svelte";

  let {
    filteredCount = 0,
    totalCount = 0,
    maxBuffer = 800,
    connected = false,
  }: {
    filteredCount?: number;
    totalCount?: number;
    maxBuffer?: number;
    connected?: boolean;
  } = $props();
</script>

<div
  class="border-border/50 text-muted-foreground flex shrink-0 items-center justify-between border-t bg-background px-4 py-2 text-xs"
>
  <div class="flex items-center gap-3">
    <span class="font-mono">
      显示 <span class="text-foreground font-medium">{filteredCount}</span> /
      <span class="text-foreground font-medium">{totalCount}</span>
    </span>
    <Separator orientation="vertical" class="h-3.5" />
    <span>缓冲上限 {maxBuffer} 条</span>
  </div>
  <div class="flex items-center gap-2 font-mono">
    {#if connected}
      <IconWifi size={14} stroke={1.5} class="text-emerald-500" />
      <span>connected</span>
    {:else}
      <IconWifiOff size={14} stroke={1.5} />
      <span>disconnected</span>
    {/if}
  </div>
</div>
