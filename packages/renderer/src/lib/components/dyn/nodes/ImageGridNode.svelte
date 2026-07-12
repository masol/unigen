<!-- src/lib/components/dyn/nodes/ImageGridNode.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as ImageZoom from "$lib/components/ui/image-zoom";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { type IValueService } from "$lib/store/ui/activity/type";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import { api } from "$lib/utils/api";
  import { path2URL } from "$lib/utils/str";
  import autoAnimate from "@formkit/auto-animate";
  import { ORPCError } from "@orpc/client";
  import {
    IconAlertTriangle,
    IconLoader2,
    IconPhoto,
    IconPlus,
    IconX,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";
  import type { ImageGridNode } from "../ast";
  import { coerceList } from "../binding.svelte";
  import { useBoundFiles } from "../use-bound-files.svelte";

  let { node, service }: { node: ImageGridNode; service: IValueService } =
    $props();

  const bound = useBoundFiles(service, () => node.dir);
  let images = $derived(coerceList<string>(bound.snapshot.value));
  let loading = $derived(bound.snapshot.loading);
  let boundError = $derived(bound.snapshot.error);

  let isUploading = $state(false);
  let busy = $derived(isUploading || loading);

  function procError(e: unknown): void {
    let msg: string;
    if (e instanceof ORPCError) {
      if (e.status === 601) return;
      if (e.status === 429) {
        toast.success(e.message);
        return;
      }
      msg = e.message || e.code;
    } else {
      msg = e instanceof Error ? e.message : String(e);
    }
    toast.error(msg);
  }

  async function handlePick() {
    if (busy) return;
    isUploading = true;
    try {
      const result = await api().system.openFile({ filters: "image" });
      let paths: string[];
      if (typeof result === "string") paths = [result];
      else if (Array.isArray(result)) paths = result;
      else throw new Error("Invalid openFile result");
      await service.fileAdd(node.dir, paths);
    } catch (e) {
      procError(e);
    } finally {
      isUploading = false;
    }
  }

  async function handleRemove(image: string, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    const ok = await confirmStore.request({
      title: node.confirmTitle ?? "确认删除",
      message: node.confirmMessage ?? "确定要删除这张图片吗？",
    });
    if (!ok) return;
    try {
      await service.fileRemove(node.dir, [image]);
    } catch (e) {
      procError(e);
    }
  }
</script>

<div class="space-y-3">
  {#if boundError}
    <div
      class="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      role="alert"
    >
      <IconAlertTriangle size={16} stroke={1.5} class="mt-0.5 shrink-0" />
      <span class="whitespace-pre-wrap wrap-break-word">{boundError}</span>
    </div>
  {/if}

  <Button
    class="w-full rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
    disabled={busy}
    onclick={handlePick}
  >
    {#if isUploading}
      <IconLoader2 size={18} stroke={1.5} class="animate-spin" />
      处理中…
    {:else}
      <IconPlus size={18} stroke={1.5} />
      {node.addLabel}
    {/if}
  </Button>

  <ScrollArea class="h-87.5 pr-2">
    {#if images.length > 0}
      <ImageZoom.Root>
        <div use:autoAnimate class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {#each images as item (item)}
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
    {:else if loading}
      <div
        class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/20 p-12 text-center"
      >
        <IconLoader2
          size={20}
          stroke={1.5}
          class="animate-spin text-muted-foreground"
        />
      </div>
    {:else}
      <div
        class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/20 p-12 text-center"
      >
        <div
          class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
        >
          <IconPhoto size={20} stroke={1.5} />
        </div>
        <p class="text-sm font-medium">{node.emptyTitle}</p>
        {#if node.emptyHint}
          <p
            class="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground"
          >
            {node.emptyHint}
          </p>
        {/if}
      </div>
    {/if}
  </ScrollArea>
</div>
