<!-- model-config/SettingRow.svelte -->
<script lang="ts">
  import { Switch } from "$lib/components/ui/switch";
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";

  type Props = {
    label: string;
    overridden: boolean;
    ontoggle: (overridden: boolean) => void;
    help?: string;
    children: Snippet;
  };

  let { label, overridden, ontoggle, help, children }: Props = $props();
</script>

<div
  class={cn(
    "overflow-hidden rounded-xl border transition-colors duration-200",
    overridden
      ? "border-primary/40 border-l-2 border-l-primary bg-primary/5"
      : "border-border/50 bg-muted/20",
  )}
>
  <div class="flex items-center justify-between gap-3 px-3 py-2.5">
    <span class="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
    <div class="flex shrink-0 items-center gap-1.5">
      <span
        class={cn(
          "text-[11px]",
          overridden ? "text-primary" : "text-muted-foreground",
        )}
      >
        {overridden ? "已覆盖" : "未覆盖"}
      </span>
      <Switch
        checked={overridden}
        onCheckedChange={ontoggle}
        aria-label={`${overridden ? "取消覆盖" : "覆盖"}${label}`}
      />
    </div>
  </div>

  {#if overridden}
    <div class="space-y-2 border-t border-primary/20 px-3 py-3 animate-fade-in">
      {@render children()}
      {#if help}
        <p class="text-xs leading-relaxed text-muted-foreground">{help}</p>
      {/if}
    </div>
  {/if}
</div>
