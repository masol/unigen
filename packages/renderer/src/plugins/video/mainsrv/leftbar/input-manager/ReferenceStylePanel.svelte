<script lang="ts">
  import * as Accordion from "$lib/components/ui/accordion";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as ImageZoom from "$lib/components/ui/image-zoom";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import { api } from "$lib/utils/api";
  import { path2URL } from "$lib/utils/str";
  import autoAnimate from "@formkit/auto-animate";
  import { ORPCError } from "@orpc/client";
  import {
    IconLoader2,
    IconPalette,
    IconPhoto,
    IconPlus,
    IconX,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";
  import { inputStore } from "./input.svelte";

  let accordionValue = $state("");
  let isUploading = $state(false);

  const COMMON_ORPC_ERROR_DEFS = {
    UNSUPPORTED_MEDIA_TYPE: { status: 415 },
    TOO_MANY_REQUESTS: { status: 429 },
  };

  async function handlePick() {
    if (isUploading) return;

    isUploading = true;
    try {
      const result = await api().system.openFile({ filters: "image" });

      // console.log("result=", result);

      let realPathname: string[];

      if (typeof result === "string") {
        realPathname = [result];
      } else if (Array.isArray(result)) {
        realPathname = result;
      } else {
        throw new Error("Invalid openFile result");
      }

      await inputStore.addVisualRef(realPathname);
    } catch (e: unknown) {
      procError(e);
    } finally {
      isUploading = false;
    }
  }

  function procError(e: unknown): boolean {
    let msg: string;
    if (e instanceof ORPCError) {
      if (e.status === 601) {
        return false;
      } else if (e.status === COMMON_ORPC_ERROR_DEFS.TOO_MANY_REQUESTS.status) {
        toast.success(e.message);
        return false;
      }
      msg = e.message || e.code;
    } else {
      msg = e instanceof Error ? e.message : String(e);
    }
    toast.error(msg);
    return false;
  }

  async function handleRemove(image: string, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();

    const confirmed = await confirmStore.request({
      title: "确认删除",
      message: "确定要删除这张参考图吗？",
    });

    if (confirmed) {
      try {
        await inputStore.rmVisualRef(image);
      } catch (e: unknown) {
        procError(e);
      }
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
            <ImageZoom.Root>
              <div
                use:autoAnimate
                class="grid grid-cols-2 gap-3 sm:grid-cols-3"
              >
                {#each inputStore.visualStyle as item (item)}
                  <div
                    class="group relative aspect-square overflow-hidden rounded-2xl border border-border/50 bg-muted"
                  >
                    <ImageZoom.Trigger
                      src={path2URL(item)}
                      alt={item}
                      class="h-full w-full object-cover"
                    />

                    <Button
                      variant="destructive"
                      size="icon"
                      class="absolute right-0 top-0 h-5 w-5 rounded-lg opacity-0 shadow-xl transition-all duration-200 group-hover:opacity-100 hover:-translate-y-0.5"
                      onclick={(e) => handleRemove(item, e)}
                    >
                      <IconX size={16} stroke={1.5} />
                    </Button>
                  </div>
                {/each}
              </div>
            </ImageZoom.Root>
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
