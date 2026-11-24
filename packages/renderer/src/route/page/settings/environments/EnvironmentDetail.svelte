<script lang="ts">
  import { push } from "@keenmate/svelte-spa-router";
  import { IconChevronLeft } from "@tabler/icons-svelte";

  function goBack() {
    push("/settings/environments");
  }
</script>

<div class="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 p-6 md:p-8">
  <nav class="flex items-center gap-2 text-xs text-muted-foreground">
    <button
      type="button"
      onclick={goBack}
      class="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
    >
      <IconChevronLeft class="size-3.5" />
      自有算力
    </button>
    <span class="text-muted-foreground/50">/</span>
    <span class="text-foreground">尚未实现</span>
  </nav>

  <div
    class="rounded-2xl border border-dashed border-border/60 p-8 text-center"
  >
    <p class="text-sm font-medium text-foreground">自有算力暂未实现</p>
    <p class="mt-1 text-xs text-muted-foreground">
      该入口已保留。当前请使用 Ollama / LM Studio 等工具运行模型，并在「设置 →
      AIGC 模型」中手动接入。
    </p>
  </div>
</div>
