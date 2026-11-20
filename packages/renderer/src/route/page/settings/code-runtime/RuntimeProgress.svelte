<script lang="ts">
  type Props = {
    progress: number;
    message?: string;
  };
  let { progress, message }: Props = $props();

  const safeProgress = $derived(Math.max(0, Math.min(100, progress)));
</script>

<div class="space-y-2">
  <div
    class="flex items-center justify-between gap-2 text-xs text-muted-foreground"
  >
    <span>{message ?? "准备中…"}</span>
    <span class="tabular-nums">{safeProgress}%</span>
  </div>
  <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
    <div
      class="h-full rounded-full bg-primary transition-all duration-500 ease-out"
      style="width: {safeProgress}%"
    ></div>
  </div>
</div>
