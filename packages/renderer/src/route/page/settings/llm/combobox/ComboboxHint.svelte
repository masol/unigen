<!-- ComboboxHint.svelte -->
<!-- 首次打开 popover 时显示的键盘速查条；用 localStorage 记忆只显示一次。 -->
<script lang="ts">
  import { IconKeyboard } from "@tabler/icons-svelte";
</script>

<div
  class="flex items-center gap-2 border-t border-border/50 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground"
>
  <IconKeyboard size={12} stroke={1.5} class="shrink-0" />
  <span class="flex items-center gap-1">
    <kbd
      class="rounded border border-border/60 bg-background px-1 font-mono text-[10px]"
      >↑</kbd
    >
    <kbd
      class="rounded border border-border/60 bg-background px-1 font-mono text-[10px]"
      >↓</kbd
    >
    导航
  </span>
  <span class="text-border">·</span>
  <kbd
    class="rounded border border-border/60 bg-background px-1 font-mono text-[10px]"
    >Enter</kbd
  >
  确认
  <span class="text-border">·</span>
  <kbd
    class="rounded border border-border/60 bg-background px-1 font-mono text-[10px]"
    >Esc</kbd
  >
  取消
</div>
