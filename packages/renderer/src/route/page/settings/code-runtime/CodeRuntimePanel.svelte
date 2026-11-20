<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import RuntimeCard from "./RuntimeCard.svelte";
  import WarningCard from "./WarningCard.svelte";
  import { codeRuntimeStore } from "./store.svelte";

  onMount(() => codeRuntimeStore.load());
</script>

<div class="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 p-6 md:p-8">
  <header class="space-y-1">
    <h1 class="text-xl font-semibold tracking-tight text-foreground">
      代码执行
    </h1>
    <p class="text-sm text-muted-foreground">
      决定 AI 是否可以在你的电脑上运行脚本，以及运行在哪个环境里。
    </p>
  </header>

  <WarningCard />

  {#if codeRuntimeStore.loading}
    <div class="space-y-3">
      {#each Array(2) as _, i (i)}
        <Skeleton class="h-28 rounded-2xl" />
      {/each}
    </div>
  {:else if codeRuntimeStore.entries.length === 0}
    <div
      in:fade={{ duration: 180, easing: cubicInOut }}
      class="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground"
    >
      当前版本暂未提供可用的代码环境。
    </div>
  {:else}
    <div class="space-y-3" in:fade={{ duration: 180, easing: cubicInOut }}>
      {#each codeRuntimeStore.entries as entry (entry.info.id)}
        <RuntimeCard info={entry.info} runtimeState={entry.state} />
      {/each}
    </div>
  {/if}
</div>
