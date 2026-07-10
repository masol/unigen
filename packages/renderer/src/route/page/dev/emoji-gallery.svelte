<script lang="ts">
  import { RuntimeIcon, loadTwemojiNames } from "$lib/components/runtimeicon";
  import VirtualGrid from "$lib/components/runtimeicon/virtual-grid.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import {
    IconArrowRight,
    IconCheck,
    IconLibrary,
    IconMoodEmpty,
    IconSearch,
    IconX,
  } from "@tabler/icons-svelte";
  import { debounce } from "radashi";
  import { push } from "svelte-spa-router";
  let query = $state("");
  let debouncedQuery = $state("");
  let copied = $state<string | null>(null);
  let all = $state<string[]>([]);
  let loading = $state(true);
  $effect(() => {
    loadTwemojiNames().then((names) => {
      all = names;
      loading = false;
    });
  });
  const applyQuery = debounce({ delay: 500 }, (v: string) => {
    debouncedQuery = v;
  });
  $effect(() => {
    applyQuery(query);
  });
  const filtered = $derived.by(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((n) => n.toLowerCase().includes(q));
  });
  async function copy(name: string) {
    await navigator.clipboard.writeText(name);
    copied = name;
    setTimeout(() => {
      if (copied === name) copied = null;
    }, 1200);
  }
  function reset() {
    query = "";
    debouncedQuery = "";
  }
</script>

<div class="flex h-full w-full flex-col gap-8 bg-background p-8 md:p-12">
  <header class="flex flex-col gap-6">
    <div class="flex items-end justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-3xl font-semibold tracking-tight">Emoji 库</h1>
        <p class="text-sm text-muted-foreground">
          Twemoji 彩色 Emoji · 运行时 iconify 渲染
        </p>
      </div>
      <div class="flex gap-3 items-center">
        <Badge variant="secondary" class="rounded-lg text-xs"
          >{filtered.length} 个匹配</Badge
        >
        <Button
          variant="outline"
          class="rounded-xl"
          onclick={() => push("/dev/icon-playground")}
        >
          <IconLibrary size={20} stroke={1.5} class="mr-2" /> 试验台
          <IconArrowRight size={20} stroke={1.5} class="ml-2" />
        </Button>
        <Button
          variant="outline"
          class="rounded-xl"
          onclick={() => push("/dev/icons")}
        >
          <IconLibrary size={20} stroke={1.5} class="mr-2" /> 图标库
          <IconArrowRight size={20} stroke={1.5} class="ml-2" />
        </Button>
      </div>
    </div>
    <div class="relative">
      <IconSearch
        size={20}
        stroke={1.5}
        class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        bind:value={query}
        placeholder="搜索 emoji，如 fire、heart、smile…"
        class="h-12 rounded-xl border-border/50 pl-12 pr-12 text-sm"
      />
      {#if query}
        <button
          onclick={reset}
          class="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-all duration-200 hover:text-foreground"
          aria-label="清除搜索"
        >
          <IconX size={20} stroke={1.5} />
        </button>
      {/if}
    </div>
  </header>
  <div
    class="min-h-0 flex-1 rounded-3xl border border-border/50 bg-card p-6 shadow-sm md:p-8"
  >
    {#if !loading && filtered.length === 0}
      <div
        class="flex h-full flex-col items-center justify-center gap-4 text-center animate-fade-in"
      >
        <IconMoodEmpty
          size={48}
          stroke={1.5}
          class="text-muted-foreground/60"
        />
        <p class="text-sm text-muted-foreground">
          没有找到匹配 “{debouncedQuery}” 的 Emoji
        </p>
        <Button variant="outline" class="rounded-xl" onclick={reset}
          >清除搜索</Button
        >
      </div>
    {:else}
      <VirtualGrid items={filtered} columns={10} {loading} rowHeight={104}>
        {#snippet cell(name)}
          <button
            onclick={() => copy(name)}
            class="group flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-border/50 bg-background p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl animate-fade-in"
          >
            {#if copied === name}
              <IconCheck size={24} stroke={1.5} class="text-primary" />
            {:else}
              <RuntimeIcon {name} size={28} />
            {/if}
            <span
              class="w-full truncate text-center text-xs text-muted-foreground"
            >
              {name.replace(/^twemoji:/, "")}
            </span>
          </button>
        {/snippet}
      </VirtualGrid>
    {/if}
  </div>
</div>
