<!-- ComboboxInput.svelte -->
<!--
  常驻输入框（不是 trigger 按钮）。
  · 前置图标随 loading / failed / idle 变化；
  · 输入有内容时右侧显示：确定（对勾）+ 清空（X）；
  · feedback === "success" 时短暂显示绿色边框。
  · 本组件不持有业务状态：value + onInput 单一数据通道。
-->
<script lang="ts">
  import { cn } from "$lib/utils";
  import {
    IconAlertTriangle,
    IconCheck,
    IconLoader2,
    IconSearch,
    IconX,
  } from "@tabler/icons-svelte";

  type Props = {
    value?: string;
    placeholder?: string;
    loading?: boolean;
    failed?: boolean;
    feedback?: "idle" | "success";
    allowClear?: boolean;
    allowCommit?: boolean;
    onInput?: (value: string) => void;
    onKeydown?: (e: KeyboardEvent) => void;
    onFocus?: () => void;
    onPointerDown?: (e: PointerEvent) => void;
    onCommit?: () => void;
    onClear?: () => void;
  };

  let {
    value = "",
    placeholder = "",
    loading = false,
    failed = false,
    feedback = "idle",
    allowClear = true,
    allowCommit = true,
    onInput,
    onKeydown,
    onFocus,
    onPointerDown,
    onCommit,
    onClear,
  }: Props = $props();
</script>

<div class="relative">
  {#if loading}
    <IconLoader2
      size={16}
      stroke={1.5}
      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
    />
  {:else if failed}
    <IconAlertTriangle
      size={16}
      stroke={1.5}
      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-destructive"
    />
  {:else}
    <IconSearch
      size={16}
      stroke={1.5}
      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
    />
  {/if}

  <input
    type="text"
    {value}
    {placeholder}
    autocomplete="off"
    spellcheck="false"
    class={cn(
      "flex h-10 w-full rounded-xl border bg-background pl-9 pr-20 text-sm font-mono",
      "transition-all duration-200 placeholder:font-sans placeholder:text-muted-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      feedback === "success"
        ? "border-emerald-500/70 ring-2 ring-emerald-500/30"
        : "border-input",
    )}
    oninput={(e) => onInput?.(e.currentTarget.value)}
    onkeydown={onKeydown}
    onfocus={onFocus}
    onpointerdown={onPointerDown}
  />

  <div
    class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5"
  >
    {#if value && allowCommit}
      <button
        type="button"
        onpointerdown={(e) => e.preventDefault()}
        onclick={onCommit}
        aria-label="应用当前输入"
        title="应用当前输入（Enter）"
        class="rounded-lg p-1 text-emerald-600 transition-all duration-200 hover:bg-emerald-500/10 dark:text-emerald-400"
      >
        <IconCheck size={16} stroke={2} />
      </button>
    {/if}
    {#if value && allowClear}
      <button
        type="button"
        onpointerdown={(e) => e.preventDefault()}
        onclick={onClear}
        aria-label="清空输入"
        title="清空输入"
        class="rounded-lg p-1 text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground"
      >
        <IconX size={16} stroke={1.5} />
      </button>
    {/if}
  </div>
</div>
