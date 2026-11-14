<!-- 通用工具/技能选择面板 · BlockUI 防闪烁 · 已选置顶 · 内建固定区 · 滚动分页 -->
<!-- 折叠规则：已选 / 内建 两区可折叠；动态检索结果区固定展开 -->
<script lang="ts">
  import { BlockUi } from "$lib/components/ui/block-ui";
  import type { SelectedItem } from "$lib/store/local/msg.svelte";
  import { safeApi } from "$lib/utils/api";
  import autoAnimate from "@formkit/auto-animate";
  import { IconChevronRight } from "@tabler/icons-svelte";
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import PickerItemRow, { type PickerItem } from "./PickerItemRow.svelte";
  import PickerMenuHeader from "./PickerMenuHeader.svelte";
  import PickerSearchBar from "./PickerSearchBar.svelte";

  let {
    kind,
    selectedItems = $bindable([] as SelectedItem[]),
    builtinItems = [],
    onClose = () => {},
    emptyLabel = "没有匹配的项，试试调整筛选词",
    searchPlaceholder,
  }: {
    kind: "tools" | "skills";
    /**
     * 已选项（$bindable，双向同步）。
     * 保存完整展示信息，已选区直接渲染，无需在菜单打开时二次请求补全。
     */
    selectedItems?: SelectedItem[];
    /** 仅 tools 使用：固定在顶部的内建工具 */
    builtinItems?: PickerItem[];
    onClose?: () => void;
    emptyLabel?: string;
    searchPlaceholder?: string;
  } = $props();

  const PAGE_SIZE = 20;
  const SEARCH_DEBOUNCE_MS = 250;

  let query = $state("");
  let items = $state<PickerItem[]>([]);
  let loading = $state(false);
  let loadingMore = $state(false);
  let hasMore = $state(false);
  let error = $state<string | null>(null);

  /** 折叠状态：已选 / 内建。动态检索结果区固定展开，无状态。 */
  let selectedOpen = $state(true);
  let builtinOpen = $state(true);

  let container = $state<HTMLDivElement>();
  let listEl = $state<HTMLDivElement>();

  // 非响应式控制器：避免无谓的 $state 依赖
  let searchTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  let searchSeq = 0;

  let selectedSet = $derived(new Set(selectedItems.map((it) => it.id)));
  let totalCount = $derived(selectedItems.length);

  let builtinIdSet = $derived(new Set(builtinItems.map((it) => it.id)));

  let title = $derived(kind === "tools" ? "指定工具" : "指定技能");
  let placeholder = $derived(
    searchPlaceholder ?? (kind === "tools" ? "筛选工具…" : "筛选技能…"),
  );

  // 未选的内建工具（参与本地筛选）
  let availableBuiltins = $derived.by<PickerItem[]>(() => {
    if (kind !== "tools" || builtinItems.length === 0) return [];
    const q = query.trim().toLowerCase();
    return builtinItems.filter((it) => {
      if (selectedSet.has(it.id)) return false;
      if (!q) return true;
      const name = (it.name ?? it.title ?? it.label ?? it.id).toLowerCase();
      const desc = (it.description ?? it.desc ?? "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  });

  // 未选的检索结果（排除内建工具 id，避免与内建区重复）
  let availableItems = $derived(
    items.filter((it) => !selectedSet.has(it.id) && !builtinIdSet.has(it.id)),
  );

  let showEmpty = $derived(
    !loading &&
      !error &&
      selectedItems.length === 0 &&
      availableBuiltins.length === 0 &&
      availableItems.length === 0,
  );

  // 动态检索结果区是否需要显示"全部…"分组标题：
  // 仅当上方存在可折叠区（已选 / 内建）之一时才需要，避免单区时的冗余标题。
  let showDynamicHeader = $derived(
    selectedItems.length > 0 || availableBuiltins.length > 0,
  );

  // 仅当完全没有任何可立即展示的内容（无已选、无内建、无搜索结果）时，
  // 才用 BlockUI 遮罩整块；否则已选/内建区应立即可见，搜索加载态由结果区自行展示。
  let blocking = $derived(
    loading &&
      items.length === 0 &&
      selectedItems.length === 0 &&
      availableBuiltins.length === 0,
  );

  /**
   * 将检索/内建项转换为已选存储结构，统一 name/description 字段，
   * 保证已选区在任何时候都能直接渲染。
   */
  function toSelected(item: PickerItem): SelectedItem {
    return {
      id: item.id,
      name: item.name ?? item.title ?? item.label ?? item.id,
      description: item.description ?? item.desc,
    };
  }

  function toggle(item: PickerItem): void {
    if (selectedSet.has(item.id)) {
      selectedItems = selectedItems.filter((x) => x.id !== item.id);
    } else {
      selectedItems = [...selectedItems, toSelected(item)];
    }
  }

  function clearSelection(): void {
    selectedItems = [];
  }

  async function runSearch(q: string, offset: number): Promise<void> {
    const seq = ++searchSeq;
    const isReset = offset === 0;

    if (isReset) {
      loading = true;
      error = null;
    } else {
      loadingMore = true;
    }

    try {
      const result =
        kind === "tools"
          ? await safeApi().agent.searchTools({
              query: q,
              limit: PAGE_SIZE,
              offset,
            })
          : await safeApi().agent.searchSkills({
              query: q,
              limit: PAGE_SIZE,
              offset,
            });

      if (seq !== searchSeq) return;

      const incoming = ((result?.items ?? []) as PickerItem[]).slice();
      items = isReset ? incoming : [...items, ...incoming];
      hasMore = result?.hasMore ?? false;
    } catch (err) {
      if (seq !== searchSeq) return;
      // 失败时保留旧列表（冻结内容），避免内容闪空
      error = err instanceof Error ? err.message : "加载失败";
    } finally {
      if (seq === searchSeq) {
        loading = false;
        loadingMore = false;
      }
    }
  }

  function handleSearchInput(value: string): void {
    query = value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTimer = undefined;
      void runSearch(query.trim(), 0);
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleScroll(e: Event): void {
    if (!hasMore || loading || loadingMore) return;
    const el = e.currentTarget as HTMLDivElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      void runSearch(query.trim(), items.length);
    }
  }

  function retry(): void {
    void runSearch(query.trim(), 0);
  }

  onMount(() => {
    void runSearch("", 0);
    return () => {
      if (searchTimer) clearTimeout(searchTimer);
    };
  });

  // 外部点击关闭：仅识别自己的 trigger，其它 trigger 视为外部（自然互斥）
  $effect(() => {
    if (typeof document === "undefined") return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!container || !target) return;
      if (container.contains(target)) return;
      if (target.closest(`[data-menu-trigger="${kind}"]`)) return;
      onClose();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
    };
  });

  // ESC 关闭
  $effect(() => {
    if (typeof window === "undefined") return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });

  // ── 可折叠区标题（已选 / 内建 复用） ───────────────────────
  // 动态检索结果区不使用本 snippet（固定展开）。
  // 命名与 a11y：button + aria-expanded；ChevronRight 通过 rotate-90 表示展开态。
</script>

{#snippet sectionHeader(
  label: string,
  count: number,
  open: boolean,
  onToggle: () => void,
)}
  <button
    type="button"
    onclick={onToggle}
    aria-expanded={open}
    class="flex w-full items-center gap-1 rounded-md px-2 pt-1 pb-1.5 text-left transition-colors hover:bg-accent/40"
  >
    <IconChevronRight
      size={10}
      stroke={2.5}
      class="shrink-0 text-muted-foreground/70 transition-transform duration-200 {open
        ? 'rotate-90'
        : ''}"
    />
    <span
      class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
    >
      {label}
      <span class="text-muted-foreground/50">({count})</span>
    </span>
  </button>
{/snippet}

<div
  bind:this={container}
  class="absolute bottom-full left-0 z-50 mb-2 w-96 overflow-hidden rounded-xl border border-border/50 bg-popover shadow-xl animate-slide-up"
  role="dialog"
  aria-label={title}
>
  <PickerMenuHeader
    {title}
    count={totalCount}
    onClear={clearSelection}
    {onClose}
  />

  <PickerSearchBar value={query} {placeholder} onInput={handleSearchInput} />

  <!-- 固定高度 h-72 + overflow-x-hidden：杜绝长描述撑宽触发水平滚动条 → 遮挡右侧垂直滚动条 -->
  <BlockUi
    {blocking}
    message={kind === "tools" ? "正在检索工具…" : "正在检索技能…"}
    opacity={0.4}
    blur
  >
    <div
      bind:this={listEl}
      onscroll={handleScroll}
      class="h-72 overflow-y-auto overflow-x-hidden p-1.5"
    >
      <!-- 已选区（始终渲染，不依赖搜索结果加载状态） -->
      {#if selectedItems.length > 0}
        {@render sectionHeader(
          "已选",
          selectedItems.length,
          selectedOpen,
          () => (selectedOpen = !selectedOpen),
        )}
        {#if selectedOpen}
          <div transition:slide={{ duration: 200 }} class="overflow-hidden">
            <div class="mb-1 flex flex-col gap-0.5" use:autoAnimate>
              {#each selectedItems as it (it.id)}
                <PickerItemRow item={it} selected onToggle={() => toggle(it)} />
              {/each}
            </div>
          </div>
        {/if}
      {/if}

      <!-- 内建工具固定区（可折叠，始终渲染，不依赖搜索结果加载状态） -->
      {#if availableBuiltins.length > 0}
        {@render sectionHeader(
          "内建",
          availableBuiltins.length,
          builtinOpen,
          () => (builtinOpen = !builtinOpen),
        )}
        {#if builtinOpen}
          <div transition:slide={{ duration: 200 }} class="overflow-hidden">
            <div class="mb-1 flex flex-col gap-0.5" use:autoAnimate>
              {#each availableBuiltins as it (it.id)}
                <PickerItemRow item={it} onToggle={() => toggle(it)} />
              {/each}
            </div>
          </div>
        {/if}
      {/if}

      <!-- 动态检索结果区（固定展开，不可折叠；仅本区受搜索加载状态影响） -->
      {#if loading && items.length === 0}
        <div
          class="flex items-center justify-center gap-1.5 py-4 text-xs text-muted-foreground"
        >
          <span
            class="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
          ></span>
          <span>{kind === "tools" ? "正在检索工具…" : "正在检索技能…"}</span>
        </div>
      {:else if error && items.length === 0}
        <div
          class="flex flex-col items-center justify-center gap-2 px-3 py-6 text-center"
        >
          <p class="text-xs text-destructive">{error}</p>
          <button
            type="button"
            onclick={retry}
            class="rounded-lg border border-border/50 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent"
          >
            重试
          </button>
        </div>
      {:else}
        {#if availableItems.length > 0}
          {#if showDynamicHeader}
            <p
              class="px-2 pt-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
            >
              {kind === "tools" ? "全部工具" : "全部技能"}
            </p>
          {/if}
          <div class="flex flex-col gap-0.5" use:autoAnimate>
            {#each availableItems as it (it.id)}
              <PickerItemRow item={it} onToggle={() => toggle(it)} />
            {/each}
          </div>
        {/if}

        <!-- 空态 -->
        {#if showEmpty}
          <div class="flex items-center justify-center px-3 py-6">
            <p class="text-xs text-muted-foreground">{emptyLabel}</p>
          </div>
        {/if}
      {/if}

      {#if loadingMore}
        <div
          class="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground"
        >
          <span
            class="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
          ></span>
          <span>加载更多…</span>
        </div>
      {/if}

      {#if error && items.length > 0}
        <div
          class="flex items-center justify-center gap-2 py-1.5 text-xs text-destructive"
        >
          <span>{error}</span>
          <button type="button" onclick={retry} class="underline">
            重试
          </button>
        </div>
      {/if}
    </div>
  </BlockUi>
</div>
