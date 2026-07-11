<script lang="ts">
  import { resolveIcon, RuntimeIcon } from "$lib/components/runtimeicon";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Slider } from "$lib/components/ui/slider";
  import { Textarea } from "$lib/components/ui/textarea";
  import {
    IconArrowRight,
    IconLibrary,
    IconMoodSmile,
  } from "@tabler/icons-svelte";
  import { push } from "svelte-spa-router";
  let raw = $state("IconRocket");
  let size = $state([96]);
  const resolved = $derived(resolveIcon(raw));
  const kindLabel = $derived.by(() => {
    switch (resolved.kind) {
      case "tabler":
        return "Tabler 线条图标";
      case "iconify":
        return "Iconify 彩色图标";
      case "base64":
        return "Base64 图片";
      case "svg":
        return "内联 SVG";
      default:
        return "空";
    }
  });
  const presets = [
    "IconRocket",
    "IconHeart",
    "home",
    "twemoji:fire",
    "twemoji:red-heart",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/></svg>',
  ];
</script>

<div class="flex h-full w-full flex-col gap-8 bg-background p-8 md:p-12">
  <header
    class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
  >
    <div class="space-y-1">
      <h1 class="text-3xl font-semibold tracking-tight">图标测试台</h1>
      <p class="text-sm text-muted-foreground">
        输入任意字符串，实时预览 RuntimeIcon 的分流渲染结果
      </p>
    </div>
    <div class="flex gap-3">
      <Button
        variant="outline"
        class="rounded-xl"
        onclick={() => push("/dev/icons")}
      >
        <IconLibrary size={20} stroke={1.5} class="mr-2" /> 图标库
        <IconArrowRight size={20} stroke={1.5} class="ml-2" />
      </Button>
      <Button
        variant="outline"
        class="rounded-xl"
        onclick={() => push("/dev/emojis")}
      >
        <IconMoodSmile size={20} stroke={1.5} class="mr-2" /> Emoji 库
        <IconArrowRight size={20} stroke={1.5} class="ml-2" />
      </Button>
    </div>
  </header>

  <div class="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
    <Card.Root class="flex flex-col rounded-3xl border-border/50 shadow-sm">
      <Card.Header>
        <Card.Title class="text-lg font-medium">输入</Card.Title>
      </Card.Header>
      <Card.Content class="flex flex-1 flex-col gap-6">
        <Textarea
          bind:value={raw}
          rows={5}
          placeholder="IconHome / twemoji:fire / data:image... / <svg...>"
          class="resize-none rounded-xl border-border/50 font-mono text-sm"
        />

        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-sm text-foreground">尺寸</span>
            <span class="text-xs text-muted-foreground">{size[0]}px</span>
          </div>
          <Slider
            type="multiple"
            bind:value={size}
            min={16}
            max={160}
            step={4}
          />
        </div>

        <div class="space-y-3">
          <span class="text-xs text-muted-foreground">快速预设</span>
          <div class="flex flex-wrap gap-2">
            {#each presets as p (p)}
              <Button
                variant="secondary"
                size="sm"
                class="rounded-xl text-xs"
                onclick={() => (raw = p)}
              >
                {p.startsWith("<svg") ? "<svg…>" : p}
              </Button>
            {/each}
          </div>
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root class="flex flex-col rounded-3xl border-border/50 shadow-sm">
      <Card.Header class="flex flex-row items-center justify-between">
        <Card.Title class="text-lg font-medium">预览</Card.Title>
        <Badge variant="secondary" class="rounded-lg text-xs">{kindLabel}</Badge
        >
      </Card.Header>
      <Card.Content class="flex flex-1 flex-col">
        <div
          class="flex flex-1 items-center justify-center rounded-2xl border border-border/50 bg-muted/30 p-8"
        >
          {#if resolved.kind === "empty"}
            <p class="text-sm text-muted-foreground">输入内容以预览</p>
          {:else}
            <div class="animate-fade-in text-foreground">
              <RuntimeIcon name={raw} size={size[0]} />
            </div>
          {/if}
        </div>

        <div
          class="mt-6 space-y-2 rounded-xl bg-muted/40 p-4 font-mono text-xs"
        >
          <div class="flex justify-between gap-4">
            <span class="text-muted-foreground">kind</span>
            <span class="text-primary">{resolved.kind}</span>
          </div>
          <div class="flex justify-between gap-4">
            <span class="text-muted-foreground">size</span>
            <span class="text-foreground">{size[0]}px</span>
          </div>
          <div class="flex justify-between gap-4 truncate">
            <span class="shrink-0 text-muted-foreground">input</span>
            <span class="truncate text-foreground" title={raw}>
              {raw.length > 40 ? raw.slice(0, 40) + "…" : raw}
            </span>
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</div>
