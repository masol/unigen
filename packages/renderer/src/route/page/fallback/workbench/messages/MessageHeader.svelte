<!-- 消息头 · 封装 avatar + 身份 + 操作三件套 -->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    align = "start",
    identity,
    actions,
    class: className,
  }: {
    align?: "start" | "end";
    identity: Snippet;
    actions?: Snippet;
    class?: string;
  } = $props();
</script>

{#if align === "end"}
  <div class={["flex items-center justify-end gap-2", className]}>
    {#if actions}
      <div class="flex items-center gap-0.5">
        {@render actions()}
      </div>
    {/if}
    {@render identity()}
  </div>
{:else}
  <div class={["flex items-center gap-2", className]}>
    {@render identity()}
    {#if actions}
      <div class="ml-auto flex items-center gap-0.5">
        {@render actions()}
      </div>
    {/if}
  </div>
{/if}
