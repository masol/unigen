<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { push } from "@keenmate/svelte-spa-router";
  import { IconAlertTriangle, IconServerOff } from "@tabler/icons-svelte";
  import { onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import EnvironmentCard from "./EnvironmentCard.svelte";
  import { environmentsStore } from "./store.svelte";

  onMount(() => environmentsStore.loadList());

  function open(id: string) {
    push(`/settings/environments/${id}`);
  }
</script>

<div class="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 p-6 md:p-8">
  <header class="space-y-1">
    <h1 class="text-xl font-semibold tracking-tight text-foreground">
      自有环境
    </h1>

    <p class="text-sm text-muted-foreground">
      管理本机或通过 SSH 连接的训练及推理环境(llama,unsloth)。
      <span
        class="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5
                   text-[11px] font-semibold tracking-wide
                   text-amber-600 dark:text-amber-400
                   ring-1 ring-inset ring-amber-500/30
                   shadow-[0_0_0_3px_rgba(245,158,11,0.08)]"
      >
        <IconAlertTriangle size={12} stroke={2.25} />
        当前民用级设备支持微调（LoRA/QLoRA）；特定条件下，可完成小模型全参微调或实验性预训练，但不具备生产级预训练能力。
      </span>
    </p>
  </header>

  {#if environmentsStore.listLoading}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      {#each Array(2) as _, i (i)}
        <Skeleton class="h-40 rounded-2xl" />
      {/each}
    </div>
  {:else if environmentsStore.summaries.length === 0}
    <div
      in:fade={{ duration: 180, easing: cubicInOut }}
      class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 py-16 text-center"
    >
      <span
        class="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
      >
        <IconServerOff class="size-7" />
      </span>
      <div class="space-y-1">
        <p class="text-sm font-medium text-foreground">尚未提供任何环境</p>
        <p class="max-w-sm text-xs text-muted-foreground">
          当前版本暂不支持在界面中配置自有环境。
        </p>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      {#each environmentsStore.summaries as env (env.id)}
        <EnvironmentCard {env} onOpen={() => open(env.id)} />
      {/each}
    </div>
  {/if}
</div>
