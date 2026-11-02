<!-- 三点加载指示 · 全站复用 · aria-live 友好 -->
<script lang="ts">
  let {
    label,
    class: className,
    size = "md",
  }: {
    label?: string;
    class?: string;
    size?: "sm" | "md";
  } = $props();

  let dotSize = $derived(size === "sm" ? "size-1" : "size-1.5");
</script>

<span
  class={[
    "inline-flex items-center gap-2 text-xs text-muted-foreground",
    className,
  ]}
  aria-live="polite"
>
  <span class="flex gap-1" aria-hidden="true">
    <span
      class={[dotSize, "animate-bounce rounded-full bg-primary/60"]}
      style:animation-delay="0ms"
    ></span>
    <span
      class={[dotSize, "animate-bounce rounded-full bg-primary/60"]}
      style:animation-delay="150ms"
    ></span>
    <span
      class={[dotSize, "animate-bounce rounded-full bg-primary/60"]}
      style:animation-delay="300ms"
    ></span>
  </span>
  {#if label}
    <span>{label}</span>
  {/if}
</span>
