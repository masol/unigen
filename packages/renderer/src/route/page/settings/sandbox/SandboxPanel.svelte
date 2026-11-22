<script lang="ts">
  import { IconCloud } from "@tabler/icons-svelte";
</script>

<div class="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 p-6 md:p-8">
  <header class="space-y-1">
    <h1 class="text-xl font-semibold tracking-tight text-foreground">
      云端设备
    </h1>
    <p class="text-sm text-muted-foreground">
      让 AI 管理您的云端设备 (沙盒是一种即用即抛的云端设备)。
    </p>
  </header>

  <section class="rounded-2xl border border-dashed border-border/60 p-8">
    <div class="flex items-start gap-3">
      <span
        class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
      >
        <IconCloud class="size-5" />
      </span>
      <div class="space-y-1">
        <p class="text-sm font-semibold text-foreground">尚未支持</p>
        <p class="text-sm leading-relaxed text-muted-foreground">
          云端沙盒会为 AI 提供独立的运行环境。AI
          生成的代码在该环境中执行，不读取本机文件，不访问本机网络。
        </p>
      </div>
    </div>
  </section>
</div>
