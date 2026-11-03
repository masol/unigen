<!-- 消息头 · 线性布局 · AI头部不抢焦点 -->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    role,
    identity,
    actions,
    class: className,
  }: {
    role: "user" | "assistant";
    identity: Snippet;
    actions?: Snippet;
    class?: string;
  } = $props();
</script>

{#if role === "user"}
  <!-- 用户：右对齐，actions在左，identity在右 -->
  <div class={["flex items-center justify-end gap-2", className]}>
    {#if actions}
      <div class="flex shrink-0 items-center gap-0.5">
        {@render actions()}
      </div>
    {/if}
    <div class="flex shrink-0 items-center gap-2">
      {@render identity()}
    </div>
  </div>
{:else}
  <!-- 助手：线性左对齐，identity + actions 在同一行流式排列 -->
  <div class={["flex items-center gap-2", className]}>
    {@render identity()}
    {#if actions}
      <div class="ml-1 flex shrink-0 items-center gap-0.5">
        {@render actions()}
      </div>
    {/if}
  </div>
{/if}
