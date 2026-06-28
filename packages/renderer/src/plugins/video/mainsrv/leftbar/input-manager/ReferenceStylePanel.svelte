<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ 职责：参考风格区域 — 选择/展示整体风格参考图（多图 grid） │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Input } from "$lib/components/ui/input";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import * as Accordion from "$lib/components/ui/accordion";
  import * as ImageZoom from "$lib/components/ui/image-zoom";
  import {
    IconPhoto,
    IconPlus,
    IconPalette,
    IconLoader2,
  } from "@tabler/icons-svelte";
  import autoAnimate from "@formkit/auto-animate";
  import { inputStore } from "./store.svelte";

  // 默认收起风格参考
  let accordionValue = $state("");

  // 选择/上传中的状态（转圈）
  let isUploading = $state(false);

  // 隐藏的文件选择器引用，由按钮触发点击
  let fileInput = $state<HTMLInputElement | null>(null);

  function handlePick() {
    if (isUploading) return;
    fileInput?.click();
  }

  async function handleSelect(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    console.log("files[0].",files[0])
    // fileName 即 url，这里把选中的本地图片转为可访问的 url
    const urls = Array.from(files).map((file) => file.name);

    isUploading = true;
    try {
      await inputStore.addVisual(urls);
    } finally {
      isUploading = false;
      // 重置，确保同一文件再次选择也能触发 change
      target.value = "";
    }
  }
</script>

<Accordion.Root type="single" bind:value={accordionValue} class="w-full">
  <Accordion.Item
    value="reference"
    class="rounded-2xl border border-border/50 bg-card"
  >
    <Accordion.Trigger
      class="rounded-2xl px-6 py-4 hover:no-underline hover:bg-muted/40 transition-all duration-200"
    >
      <div class="flex w-full items-center gap-3">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconPalette size={18} stroke={1.5} />
        </div>
        <h3 class="text-base font-medium tracking-tight">风格参考</h3>
        <Badge
          variant="secondary"
          class="ml-auto rounded-lg px-2 py-0.5 text-xs"
        >
          {inputStore.visualStyle.length}
        </Badge>
      </div>
    </Accordion.Trigger>

    <Accordion.Content class="px-3 pb-4">
      <div class="space-y-3">
        <!-- 隐藏的文件选择器 -->
        <Input
          bind:ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          onchange={handleSelect}
        />

        <!-- 醒目的选择图片按钮（带 loading 状态） -->
        <Button
          class="w-full rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
          disabled={isUploading}
          onclick={handlePick}
        >
          {#if isUploading}
            <IconLoader2 size={18} stroke={1.5} class="animate-spin" />
            处理中…
          {:else}
            <IconPlus size={18} stroke={1.5} />
            选择参考图
          {/if}
        </Button>

        <ScrollArea class="h-87.5 pr-2">
          {#if inputStore.visualStyle.length > 0}
            <!--╭─────────────────────────────────────────────────────╮ -->
            <!-- │ 职责：以 grid 渲染参考图卡片，点击可放大查看           │ -->
            <!-- ╰─────────────────────────────────────────────────────╯ -->
            <div use:autoAnimate class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {#each inputStore.visualStyle as item (item.id)}
                <div
                  class="group relative aspect-square overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl animate-fade-in"
                >
                  <ImageZoom.Root>
                    <ImageZoom.Trigger
                      src={item.fileName}
                      alt={item.fileName}
                      class="h-full w-full cursor-zoom-in object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  </ImageZoom.Root>
                </div>
              {/each}
            </div>
            <!-- ╭─── / ReferenceStyleGrid ───╮ -->
          {:else}
            <!--╭─────────────────────────────────────────────────────╮ -->
            <!-- │ 职责：空态 — 说明此处仅设置整体风格                    │ -->
            <!-- ╰─────────────────────────────────────────────────────╯ -->
            <div
              class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/20 p-12 text-center"
            >
              <div
                class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
              >
                <IconPhoto size={20} stroke={1.5} />
              </div>
              <p class="text-sm font-medium">还没有参考图</p>
              <p
                class="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground"
              >
                这里只设置整体风格。单独的环境 / 人物参考图，
                请在素材库生成之后，在素材库中设置。
              </p>
            </div>
          {/if}
        </ScrollArea>
      </div>
    </Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
