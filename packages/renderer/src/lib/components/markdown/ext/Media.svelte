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

  // @humanspeak/svelte-markdown 的 image renderer 可能不传 href/src，
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
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { safeApi } from "$lib/utils/api";
  import autoAnimate from "@formkit/auto-animate";
  import Logger from "electron-log/renderer.js";
  import { onMount } from "svelte";
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

  // 非响应式的竞态序号，仅在组件生命周期内自增
  let requestId = 0;

  const ext = $derived(getExt(resolved || orig));
  const kind = $derived(VIDEO_EXTS.has(ext) ? "video" : "image");

  async function load(target: string) {
    const id = ++requestId;

    resolved = "";
    failed = false;
    loading = true;

    if (!target) {
      loading = false;
      failed = true;
      return;
    }

    try {
      const next = await safeApi().project.getURL(target);
      if (id !== requestId) return;
      if (!next) {
        failed = true;
        return;
      }
      resolved = next;
    } catch (err) {
      if (id !== requestId) return;
      Logger.error("[MarkdownMedia] project.getURL failed:", target, err);
      failed = true;
    } finally {
      if (id === requestId) loading = false;
    }
  }

  onMount(() => {
    void load(orig);
    return () => {
      // 卸载时使所有进行中的请求失效
      requestId++;
    };
  });
</script>

<div class="not-prose my-3 w-full" title={title ?? undefined} use:autoAnimate>
  {#if loading}
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → MediaSkeleton.svelte]                │ -->
    <!-- │职责：按媒体类型（video/image）渲染等尺寸骨架占位     │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <div class="flex w-full justify-center">
      <Skeleton
        class={kind === "video"
          ? "aspect-video w-full max-w-xl rounded-2xl"
          : "h-64 w-full rounded-2xl"}
      />
    </div>
    <!-- ╭─── / MediaSkeleton ───╮ -->
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
