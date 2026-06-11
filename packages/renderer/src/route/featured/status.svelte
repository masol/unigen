<script lang="ts">
  // ── Tabler Icons ──
  import {
    IconGitBranch,
    IconAlertTriangle,
    IconBell,
  } from "@tabler/icons-svelte";
</script>

<!-- ╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → StatusBar.svelte]│ -->
<!-- │ 职责：底部状态栏，显示分支、通知、行列号等全局状态信息    │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<div
  class="flex h-6 shrink-0 items-center justify-between border-t border-border/50 bg-muted/40 px-3"
>
  <div class="flex items-center gap-3">
    <button
      class="flex items-center gap-1 text-xs text-muted-foreground transition-all duration-200 hover:text-foreground"
    >
      <IconGitBranch class="size-3.5" />
      <span>main</span>
    </button>
    <button
      class="flex items-center gap-1 text-xs text-muted-foreground transition-all duration-200 hover:text-foreground"
    >
      <IconAlertTriangle class="size-3.5" />
      <span>0</span>
    </button>
  </div>
  <div class="flex items-center gap-3">
    <span class="text-xs text-muted-foreground">UTF-8</span>
    <span class="text-xs text-muted-foreground">Svelte</span>
    <button
      class="flex items-center text-xs text-muted-foreground transition-all duration-200 hover:text-foreground"
    >
      <IconBell class="size-3.5" />
    </button>
  </div>
</div>
