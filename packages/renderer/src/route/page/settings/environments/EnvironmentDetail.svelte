<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { push } from "@keenmate/svelte-spa-router";
  import { IconChevronLeft, IconRefresh } from "@tabler/icons-svelte";
  import { cubicInOut } from "svelte/easing";
  import { slide } from "svelte/transition";
  import ConnectionSettings from "./ConnectionSettings.svelte";
  import FallbackConfig from "./configs/FallbackConfig.svelte";
  import { resolveEnvironmentConfig } from "./registry";
  import { environmentsStore } from "./store.svelte";

  // 官方文档推荐方式：路由参数通过 $props().routeParams 注入
  // （@keenmate/svelte-spa-router 没有 `params` 导出）。
  type Props = {
    routeParams?: Record<string, string>;
  };
  let { routeParams = {} }: Props = $props();

  const id = $derived(routeParams.id);

  // 用 $effect 而非 onMount：同一路由实例复用、id 变化时也能触发加载。
  $effect(() => {
    if (id) environmentsStore.loadDetail(id);
  });

  const detail = $derived(id ? environmentsStore.details[id] : undefined);
  const loading = $derived(id ? environmentsStore.detailLoading[id] : false);
  const ConfigComponent = $derived(
    detail ? resolveEnvironmentConfig(detail.kind) : null,
  );

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
      自有环境
    </button>
    <span class="text-muted-foreground/50">/</span>
    <span class="text-foreground">{detail?.name ?? id ?? ""}</span>
  </nav>

  {#if loading}
    <p class="text-xs text-muted-foreground">加载中…</p>
  {:else if !detail}
    <div
      class="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground"
    >
      未找到该环境。
    </div>
  {:else}
    <header class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-xl font-semibold tracking-tight text-foreground">
          {detail.name}
        </h1>
        <p class="text-sm text-muted-foreground">{detail.description}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="gap-1.5 rounded-lg text-muted-foreground"
        onclick={() => environmentsStore.probe(detail.id)}
        disabled={detail.status === "checking"}
      >
        <IconRefresh
          class="size-4 {detail.status === 'checking' ? 'animate-spin' : ''}"
        />
        重新检测
      </Button>
    </header>

    <ConnectionSettings {detail} />

    <div transition:slide={{ duration: 180, easing: cubicInOut }}>
      {#if ConfigComponent}
        <ConfigComponent
          environmentId={detail.id}
          config={detail.config}
          onPatch={(patch) => environmentsStore.updateConfig(detail.id, patch)}
        />
      {:else}
        <FallbackConfig />
      {/if}
    </div>
  {/if}
</div>
