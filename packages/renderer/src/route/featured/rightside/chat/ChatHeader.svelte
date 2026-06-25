<!-- src/lib/components/chat/ChatHeader.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { IconSparkles, IconTrash } from "@tabler/icons-svelte";

  let {
    title = "AI 对话助手",
    subtitle = "随时为你解答技术问题",
    canClear = true,
    onClear = () => {},
  }: {
    title?: string;
    subtitle?: string;
    canClear?: boolean;
    onClear?: () => void;
  } = $props();
</script>

<div
  class="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-3"
>
  <div class="flex items-center gap-3">
    <div
      class="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-200"
    >
      <IconSparkles size={18} stroke={1.5} />
    </div>
    <div>
      <h2 class="text-sm font-medium tracking-tight">{title}</h2>
      <p class="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  </div>

  <Button
    variant="ghost"
    size="sm"
    class="size-8 rounded-xl p-0 transition-all duration-200 hover:-translate-y-0.5"
    onclick={onClear}
    disabled={!canClear}
  >
    <IconTrash size={16} stroke={1.5} />
  </Button>
</div>
