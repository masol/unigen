<!-- ComboboxSearch.svelte -->
<!--
  通用「下拉建议 + 自由输入」组合框（ARIA combobox 语义）。

  交互契约：
  · 输入时不自动高亮任何行 → 只有 ArrowUp/Down 才激活高亮；
  · Enter：有高亮 → 应用该项；无高亮 → 提交当前草稿；
  · Escape：放弃草稿，恢复 value，关闭；
  · 点击外部：提交草稿并关闭；
  · 对勾按钮：提交草稿；
  · X 按钮：清空草稿（保持 popover 打开）。

  状态模型：
  · value  —— 外部已提交值（$bindable）
  · draftOverride —— 用户编辑的临时草稿；null 时 draft 跟随 value
  · draft = draftOverride ?? value —— input 显示内容
  · 提交：value = draft；draftOverride = null
  · 取消：draftOverride = null
-->

<script lang="ts">
  import { untrack } from "svelte";
  import ComboboxHint from "./ComboboxHint.svelte";
  import ComboboxInput from "./ComboboxInput.svelte";
  import ComboboxList from "./ComboboxList.svelte";
  import {
    hasSeenComboboxHint,
    markComboboxHintSeen,
    type ComboboxGroup,
    type ComboboxItem,
  } from "./combobox.types";

  type Props = {
    /** 双向绑定：已提交值 */
    value?: string;
    items?: ComboboxItem[];
    selectedValue?: string;
    open?: boolean;
    placeholder?: string;
    emptyText?: string;
    /** true → 内部按 includes 过滤；false → 调用方按 onQueryChange 自行过滤 */
    shouldFilter?: boolean;
    loading?: boolean;
    failed?: boolean;
    loadingText?: string;
    failedText?: string;
    retryLabel?: string;
    failedHint?: string;
    /** 允许"自由文本 + Enter/对勾 提交"；关闭后不出现"使用 xxx"行 */
    allowCommitText?: boolean;
    onRetry?: () => void;
    onSelect?: (item: ComboboxItem) => void;
    onCommitText?: (text: string) => void;
    onQueryChange?: (query: string) => void;
    onOpenChange?: (open: boolean) => void;
  };

  let {
    value = $bindable(""),
    items = [],
    selectedValue = "",
    open = $bindable(false),
    placeholder = "输入或搜索…",
    emptyText = "未找到匹配项",
    shouldFilter = false,
    loading = false,
    failed = false,
    loadingText = "正在加载…",
    failedText = "加载失败",
    retryLabel = "重试",
    failedHint = "可直接输入后按 Enter 使用当前输入",
    allowCommitText = true,
    onRetry,
    onSelect,
    onCommitText,
    onQueryChange,
    onOpenChange,
  }: Props = $props();

  let wrapperEl: HTMLDivElement | undefined = $state();

  /** 用户编辑的临时草稿；null 表示 draft 跟随 value */
  let draftOverride = $state<string | null>(null);
  const draft = $derived(draftOverride ?? value);

  /** 键盘/鼠标高亮索引；-1 = 无高亮（Enter 走自由输入） */
  let activeIndex = $state(-1);

  /** 成功反馈（短暂绿色环） */
  let feedback = $state<"idle" | "success">("idle");
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  /** 键盘提示（全局 localStorage，仅显示一次） */
  let showHint = $state(!hasSeenComboboxHint());

  // ── 过滤后的可视项 ──
  const visibleItems = $derived.by(() => {
    if (!shouldFilter) return items;
    const q = draft.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const text = `${it.label} ${it.description ?? ""} ${it.id}`.toLowerCase();
      return text.includes(q);
    });
  });

  // ── 分组 + 扁平索引 ──
  const groups = $derived.by<ComboboxGroup[]>(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, ComboboxItem[]>();
    for (const it of visibleItems) {
      const g = it.group ?? "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(it);
    }
    let idx = 0;
    return [...map.entries()].map(([heading, list]) => ({
      heading,
      items: list.map((item) => ({ item, index: idx++ })),
    }));
  });

  const flatItems = $derived(visibleItems);

  // ── 「使用 xxx」项：draft 非空且不精确匹配任何 item 时才展示 ──
  const showCreate = $derived.by(() => {
    if (!allowCommitText) return false;
    if (loading || failed) return false;
    const q = draft.trim();
    if (!q) return false;
    return !items.some((it) => it.id === q || it.label === q);
  });

  const totalOptions = $derived(flatItems.length + (showCreate ? 1 : 0));

  // ── 通知父级 query（shouldFilter=false 时用于外部搜索） ──
  $effect(() => {
    const q = draft;
    untrack(() => onQueryChange?.(q));
  });

  function setOpen(next: boolean) {
    if (open === next) return;
    open = next;
    onOpenChange?.(next);
  }

  function focusInput() {
    const el = wrapperEl?.querySelector("input");
    if (el instanceof HTMLInputElement) el.focus();
  }

  function closePopover() {
    if (showHint) {
      markComboboxHintSeen();
      showHint = false;
    }
    setOpen(false);
    activeIndex = -1;
    if (feedbackTimer !== null) {
      clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }
    feedback = "idle";
  }

  function triggerSuccess() {
    feedback = "success";
    if (feedbackTimer !== null) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      feedback = "idle";
      feedbackTimer = null;
    }, 600);
  }

  function commitDraft() {
    const text = draft.trim();
    if (!text) return;
    if (value !== text) {
      value = text;
      onCommitText?.(text);
    }
    draftOverride = null;
    triggerSuccess();
    closePopover();
  }

  function selectItem(item: ComboboxItem) {
    value = item.id;
    onSelect?.(item);
    draftOverride = null;
    triggerSuccess();
    closePopover();
    focusInput();
  }

  function selectCreate() {
    commitDraft();
  }

  function handleInput(next: string) {
    draftOverride = next;
    activeIndex = -1; // 输入即清除高亮：避免"随便打字 Enter 却选中某行"
    feedback = "idle";
    if (!open) setOpen(true);
  }

  function handleClear() {
    draftOverride = "";
    activeIndex = -1;
  }

  function handleFocus() {
    if (!open) setOpen(true);
  }

  function handlePointerDownOnInput() {
    if (!open) setOpen(true);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.isComposing) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (!open) setOpen(true);
      if (totalOptions === 0) return;
      activeIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % totalOptions;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (!open) setOpen(true);
      if (totalOptions === 0) return;
      activeIndex =
        activeIndex < 0
          ? totalOptions - 1
          : (activeIndex - 1 + totalOptions) % totalOptions;
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (!allowCommitText) return;
      if (activeIndex >= 0 && activeIndex < flatItems.length) {
        selectItem(flatItems[activeIndex]);
      } else if (activeIndex === flatItems.length && showCreate) {
        selectCreate();
      } else {
        commitDraft();
      }
    } else if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      e.stopPropagation();
      // 放弃草稿 → 恢复原值并关闭
      draftOverride = null;
      closePopover();
    }
  }

  function handleWindowPointerDown(e: PointerEvent) {
    if (!open) return;
    const target = e.target as Node;
    if (wrapperEl?.contains(target)) return;
    // 点击外部 → 视为提交（不丢失输入）
    const text = draft.trim();
    if (text && text !== value) {
      value = text;
      onCommitText?.(text);
    }
    draftOverride = null;
    closePopover();
  }

  function handleCommitClick() {
    if (!allowCommitText) return;
    commitDraft();
    focusInput();
  }
</script>

<div bind:this={wrapperEl} class="relative w-full">
  <ComboboxInput
    value={draft}
    {placeholder}
    {loading}
    {failed}
    {feedback}
    allowClear
    allowCommit={allowCommitText}
    onInput={handleInput}
    onKeydown={handleKeydown}
    onFocus={handleFocus}
    onPointerDown={handlePointerDownOnInput}
    onCommit={handleCommitClick}
    onClear={handleClear}
  />

  {#if open}
    <div
      class="absolute left-0 right-0 top-[calc(100%+4px)] z-60 overflow-hidden rounded-xl border border-border/50 bg-popover shadow-xl animate-fade-in"
    >
      <ComboboxList
        {groups}
        {flatItems}
        {activeIndex}
        {selectedValue}
        createQuery={showCreate ? draft : null}
        {loading}
        {failed}
        {loadingText}
        {failedText}
        {emptyText}
        {retryLabel}
        {failedHint}
        {onRetry}
        onSelect={selectItem}
        onCreate={selectCreate}
        onHover={(i) => (activeIndex = i)}
      />
      {#if showHint}
        <ComboboxHint />
      {/if}
    </div>
  {/if}
</div>

<svelte:window onpointerdown={handleWindowPointerDown} />
