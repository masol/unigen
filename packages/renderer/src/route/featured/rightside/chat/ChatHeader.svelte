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

<div class="flex items-center justify-between border-b border-border/50 p-6">
  <div class="flex items-center gap-3">
    <div
      class="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-200"
    >
      <IconSparkles size={20} stroke={1.5} />
    </div>
    <div>
      <h2 class="text-lg font-medium tracking-tight">{title}</h2>
      <p class="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  </div>

  <Button
    variant="ghost"
    size="sm"
    class="size-9 rounded-xl p-0 hover:-translate-y-0.5"
    onclick={onClear}
    disabled={!canClear}
  >
    <IconTrash size={16} stroke={1.5} />
  </Button>
</div>
