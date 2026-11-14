<!-- 通用内联筛选框 · tools / skills 复用 · 防抖由父组件处理 · 有内容时右侧出现清除按钮 -->
<script lang="ts">
  import { IconSearch, IconX } from "@tabler/icons-svelte";

  let {
    value = "",
    placeholder = "输入以筛选…",
    onInput = () => {},
  }: {
    value?: string;
    placeholder?: string;
    onInput?: (value: string) => void;
  } = $props();

  let inputEl = $state<HTMLInputElement>();

  function clear() {
    onInput("");
    // 清空后回焦：让用户能立即重新输入，避免多一次点击
    inputEl?.focus();
  }
</script>

<div class="border-b border-border/50 p-2">
  <div class="relative">
    <IconSearch
      size={14}
      stroke={1.5}
      class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
    />
    <input
      bind:this={inputEl}
      type="text"
      {value}
      {placeholder}
      aria-label={placeholder}
      oninput={(e) => onInput(e.currentTarget.value)}
      class="h-8 w-full rounded-lg border border-input bg-background/50 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
    />
    {#if value}
      <button
        type="button"
        onclick={clear}
        class="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="清除筛选"
        title="清除筛选"
      >
        <IconX size={12} stroke={2} />
      </button>
    {/if}
  </div>
</div>
