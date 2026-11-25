<script lang="ts">
  type Props = {
    progress: number;
    message?: string;
  };
  let { progress, message }: Props = $props();

  // 服务端偶发 NaN / 越界值时不至于把进度条撑成非法宽度。
  const safeProgress = $derived(
    Number.isFinite(progress)
      ? Math.round(Math.max(0, Math.min(100, progress)))
      : 0,
  );
</script>

<div class="space-y-2">
  <div
    class="flex items-center justify-between gap-2 text-xs text-muted-foreground"
  >
    <!-- 进度描述可能包含文件名 / 体积等长文本：单行截断，百分比固定不压缩 -->
    <span class="min-w-0 truncate" title={message}>{message ?? "准备中…"}</span>
    <span class="shrink-0 tabular-nums">{safeProgress}%</span>
  </div>
  <div
    class="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={safeProgress}
    aria-label={message ?? "准备中"}
  >
    <div
      class="h-full rounded-full bg-primary transition-all duration-500 ease-out"
      style="width: {safeProgress}%"
    ></div>
  </div>
</div>
