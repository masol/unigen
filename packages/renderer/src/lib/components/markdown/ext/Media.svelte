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

  // @humanspeak/svelte-markdown 的 image renderer 不传 href/src，
  // 只给 raw（markdown 原文），如：![alt](file:///path/a.png "title")
  // 支持 <> 包裹与可选 title；仅在 href/src/url 均为空时兜底使用。
  function parseUrlFromRaw(raw: string) {
    if (!raw) return "";
    const m =
      /!\[[^\]]*\]\(\s*(?:<([^>]*)>|([^)\s]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/.exec(
        raw,
      );
    // m[1] 为尖括号内 URL，m[2] 为裸 URL
    return (m?.[1] ?? m?.[2] ?? "").trim();
  }

  function firstNonEmpty(...values: unknown[]) {
    for (const v of values) {
      const s = String(v ?? "").trim();
      if (s) return s;
    }
    return "";
  }
</script>

<script lang="ts">
  import * as ImageZoom from "$lib/components/ui/image-zoom/index";
  import { safeApi } from "$lib/utils/api";
  import VideoPlayer from "svelte-video-player";

  let {
    src = "",
    href = "",
    url = "",
    raw = "",
    alt = "",
    text = "",
    title = null,
    ..._rest
  }: {
    src?: string;
    href?: string;
    url?: string;
    raw?: string;
    alt?: string;
    text?: string;
    title?: string | null;
    // 库会额外传入 options / slug / children 等，此处不声明具体字段
    [key: string]: unknown;
  } = $props();

  // 优先级：src > href > url > raw 解析
  const orig = $derived(firstNonEmpty(src, href, url) || parseUrlFromRaw(raw));
  const altText = $derived(firstNonEmpty(alt, text));

  let resolved = $state("");
  let loading = $state(true);
  let failed = $state(false);
  let requestId = 0;

  const ext = $derived(getExt(resolved || orig));
  const kind = $derived(VIDEO_EXTS.has(ext) ? "video" : "image");

  $effect(() => {
    const target = orig;
    const id = ++requestId;

    resolved = "";
    failed = false;
    loading = true;

    if (!target) {
      loading = false;
      failed = true;
      return;
    }

    void (async () => {
      try {
        const url = await safeApi().project.getURL(target);
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

<div class="not-prose my-3 w-full" title={title ?? undefined}>
  {#if loading}
    <div
      class="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border border-border/50 bg-muted/20 text-xs text-muted-foreground"
    >
      <div class="flex items-center gap-2">
        <span
          class="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
          aria-hidden="true"
        ></span>
        <span>正在加载媒体...</span>
      </div>
      <span class="max-w-full truncate px-4 font-mono text-[10px] opacity-60">
        {orig || "(empty src)"}
      </span>
    </div>
  {:else if failed || !resolved}
    <div
      class="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border border-border/50 bg-muted/20 text-xs text-muted-foreground"
    >
      <span>媒体加载失败</span>
      <span class="max-w-full truncate px-4 font-mono text-[10px] opacity-60">
        {orig || "(empty src)"}
      </span>
    </div>
  {:else if kind === "video"}
    <div class="mx-auto w-full max-w-xl overflow-hidden rounded-xl">
      <VideoPlayer source={resolved} />
    </div>
  {:else}
    <div class="flex w-full justify-center overflow-hidden">
      {#key resolved}
        <ImageZoom.Trigger
          src={resolved}
          alt={altText || resolved}
          class="h-auto max-h-64 w-auto max-w-full cursor-zoom-in rounded-lg object-contain"
        />
      {/key}
    </div>
  {/if}
</div>
