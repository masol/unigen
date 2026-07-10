<!-- src/lib/components/chat/ChatLink.svelte -->
<script lang="ts">
  import { IconExternalLink } from "@tabler/icons-svelte";
  import type { Snippet } from "svelte";

  let {
    href = "",
    title = undefined,
    children,
  }: { href?: string; title?: string; children?: Snippet } = $props();

  let external = $derived(/^https?:\/\//.test(href));
</script>

<a
  {href}
  {title}
  target={external ? "_blank" : undefined}
  rel={external ? "noopener noreferrer" : undefined}
  class="inline-flex items-center gap-0.5 underline underline-offset-2 transition-colors hover:opacity-80"
>
  {#if children}{@render children()}{/if}
  {#if external}<IconExternalLink size={13} stroke={1.5} class="mb-0.5" />{/if}
</a>
