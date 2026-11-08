<script module lang="ts">
  const VIDEO_EXTS = new Set([
    "mp4",
    "webm",
    "ogg",
    "mov",
    "mkv",
    "avi",
    "m4v",
  ]);

  function getExt(value: string) {
    if (!value) return "";
    const path = value.split(/[?#]/, 1)[0] ?? "";
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match?.[1]?.toLowerCase() ?? "";
  }
</script>

<script lang="ts">
  import * as ImageZoom from "$lib/components/ui/image-zoom/index";
  import { safeApi } from "$lib/utils/api";
// 注意：请按项目实际 safeApi 导出路径确认此导入。
  import VideoPlayer from "svelte-video-player";

  let {
    href = "",
    title = undefined,
    text = "",
  }: { href?: string; title?: string; text?: string } = $props();

  let resolved = $state("");
  let loading = $state(true);
  let failed = $state(false);
  let requestId = 0;

  const ext = $derived(getExt(resolved || href));
  const kind = $derived(VIDEO_EXTS.has(ext) ? "video" : "image");

  $effect(() => {
    const orig = href;
    const id = ++requestId;

    resolved = "";
    failed = false;
    loading = true;

    if (!orig) {
      loading = false;
      failed = true;
      return;
    }

    void (async () => {
      try {
        const url = await safeApi().project.getURL(orig);
        if (id !== requestId) return;
        if (!url) {
          failed = true;
          return;
        }
        resolved = url;
      } catch {
        if (id !== requestId) return;
        failed = true;
      } finally {
        if (id === requestId) loading = false;
      }
    })();

    return () => {
      requestId++;
    };
  });
</script>

<div class="not-prose my-3 w-full" {title}>
  {#if loading}
    <div
      class="flex min-h-24 w-full items-center justify-center gap-2 rounded-xl border border-border/50 bg-muted/20 text-xs text-muted-foreground"
    >
      <span
        class="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
        aria-hidden="true"
      ></span>
      <span>正在加载媒体...</span>
    </div>
  {:else if failed || !resolved}
    <div
      class="flex min-h-24 w-full items-center justify-center rounded-xl border border-border/50 bg-muted/20 text-xs text-muted-foreground"
    >
      媒体加载失败
    </div>
  {:else if kind === "video"}
    <div class="w-full overflow-hidden rounded-xl">
      <VideoPlayer source={resolved} />
    </div>
  {:else}
    <div class="flex w-full justify-center overflow-hidden">
      {#key resolved}
        <ImageZoom.Trigger
          src={resolved}
          alt={text || resolved}
          class="max-h-[70vh] max-w-full cursor-zoom-in rounded-lg object-contain"
        />
      {/key}
    </div>
  {/if}
</div>
