<!-- 外链判定：以 origin 为准，内链/锚点/特殊协议不加 target -->
<script lang="ts">
  import { IconExternalLink } from "@tabler/icons-svelte";
  import type { Snippet } from "svelte";

  let {
    href = "",
    title = undefined,
    children,
  }: { href?: string; title?: string; children?: Snippet } = $props();

  let external = $derived.by(() => {
    if (!href) return false;
    // 锚点、相对路径、特殊协议 → 内链
    // 注意：//host/path 是协议相对 URL，不能按站内路径处理
    if (/^(#|\/(?!\/)|mailto:|tel:|data:|javascript:)/i.test(href))
      return false;
    // SSR 安全：无 window 时按内链处理
    if (typeof window === "undefined") return false;
    try {
      const url = new URL(href, window.location.origin);
      return url.origin !== window.location.origin;
    } catch {
      return false;
    }
  });
</script>

<a
  {href}
  {title}
  target={external ? "_blank" : undefined}
  rel={external ? "noopener noreferrer" : undefined}
  class="inline-flex items-center gap-0.5 transition-colors hover:opacity-80"
>
  {#if children}{@render children()}{/if}
  {#if external}
    <IconExternalLink size={13} stroke={1.5} class="mb-0.5" />
    <span class="sr-only">(在浏览器中打开)</span>
  {/if}
</a>
