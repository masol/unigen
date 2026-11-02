<!-- 空状态：渲染来自 project 的欢迎 markdown -->
<script lang="ts">
  import MarkdownView from "$lib/components/markdown/Message.svelte";
  import { projectStore } from "$lib/store/project.svelte";
  import { IconMessageCircle } from "@tabler/icons-svelte";

  let welcome = $derived(projectStore.activity?.welcome);
  let title = $derived(projectStore.activity?.header.title ?? "开始对话");
</script>

<div
  class="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-10 sm:px-6"
>
  {#if welcome}
    <article class="flex flex-col gap-4">
      <MarkdownView message={{ content: welcome }} />
    </article>
  {:else}
    <div
      class="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center"
    >
      <div
        class="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
      >
        <IconMessageCircle size={28} stroke={1.5} />
      </div>
      <div class="space-y-2">
        <h2 class="text-lg font-medium text-foreground">{title}</h2>
        <p class="max-w-md text-sm leading-relaxed text-muted-foreground">
          在下方输入框开始描述你的任务，Agent 会按需规划步骤并执行。
        </p>
      </div>
    </div>
  {/if}
</div>
