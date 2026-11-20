<!-- ComboboxList.svelte -->
<!-- 列表容器：分组渲染 + loading/empty/retry 状态 + activeIndex 滚动跟随。 -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-svelte";
  import ComboboxCreateRow from "./ComboboxCreateRow.svelte";
  import ComboboxRow from "./ComboboxRow.svelte";
  import type { ComboboxGroup, ComboboxItem } from "./combobox.types";

  type Props = {
    groups?: ComboboxGroup[];
    flatItems?: ComboboxItem[];
    activeIndex?: number;
    selectedValue?: string;
    createQuery?: string | null;
    loading?: boolean;
    failed?: boolean;
    loadingText?: string;
    failedText?: string;
    emptyText?: string;
    retryLabel?: string;
    failedHint?: string;
    onRetry?: () => void;
    onSelect?: (item: ComboboxItem) => void;
    onCreate?: () => void;
    onHover?: (index: number) => void;
  };

  let {
    groups = [],
    flatItems = [],
    activeIndex = -1,
    selectedValue = "",
    createQuery = null,
    loading = false,
    failed = false,
    loadingText = "正在加载…",
    failedText = "加载失败",
    emptyText = "未找到匹配项",
    retryLabel = "重试",
    failedHint = "",
    onRetry,
    onSelect,
    onCreate,
    onHover,
  }: Props = $props();

  /** 收集每一项 DOM，供 activeIndex 变化时滚动跟随 */
  let itemEls: (HTMLElement | undefined)[] = $state([]);

  $effect(() => {
    const idx = activeIndex;
    if (idx < 0) return;
    const el = itemEls[idx];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  });

  function registerItem(index: number, el: HTMLElement | undefined) {
    itemEls[index] = el;
  }

  const showCreate = $derived(
    !loading &&
      !failed &&
      createQuery !== null &&
      createQuery.trim().length > 0,
  );

  const isEmpty = $derived(
    !loading && !failed && flatItems.length === 0 && !showCreate,
  );

  const showGroups = $derived(!loading && !failed && flatItems.length > 0);
</script>

<div class="max-h-72 overflow-y-auto py-1">
  {#if loading}
    <div
      class="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
    >
      <IconLoader2 size={16} stroke={1.5} class="animate-spin" />
      {loadingText}
    </div>
  {:else if failed}
    <div
      class="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center"
    >
      <IconAlertTriangle size={18} stroke={1.5} class="text-destructive" />
      <p class="text-sm text-muted-foreground">{failedText}</p>
      {#if failedHint}
        <p class="text-xs text-muted-foreground/70">{failedHint}</p>
      {/if}
      {#if onRetry}
        <Button
          variant="outline"
          size="sm"
          class="mt-1 h-8 rounded-lg px-3 text-xs"
          onclick={onRetry}
        >
          {retryLabel}
        </Button>
      {/if}
    </div>
  {:else if isEmpty}
    <div class="py-6 text-center text-sm text-muted-foreground">
      {emptyText}
    </div>
  {:else}
    {#if showGroups}
      {#each groups as group (group.heading)}
        {#if group.heading}
          <div
            class="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {group.heading}
          </div>
        {/if}
        <div class="px-1">
          {#each group.items as { item, index } (item.id)}
            <ComboboxRow
              {item}
              active={activeIndex === index}
              selected={selectedValue === item.id}
              elementRef={(el) => registerItem(index, el)}
              onHover={() => onHover?.(index)}
              onSelect={() => onSelect?.(item)}
            />
          {/each}
        </div>
      {/each}
    {/if}

    {#if showCreate && createQuery !== null}
      <div
        class={[
          "px-1",
          showGroups ? "mt-1 border-t border-border/50 pt-1" : "",
        ]}
      >
        <ComboboxCreateRow
          query={createQuery.trim()}
          active={activeIndex === flatItems.length}
          elementRef={(el) => registerItem(flatItems.length, el)}
          onHover={() => onHover?.(flatItems.length)}
          onSelect={() => onCreate?.()}
        />
      </div>
    {/if}
  {/if}
</div>
