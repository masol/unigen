<!-- 对话轮次快速导航 · 横条为行标识 · 受控展开/收起 · hover 进入展开 / 移出收起 / ESC 收起 -->
<script lang="ts">
  import autoAnimate from "@formkit/auto-animate";

  export type RoundEntry = {
    id: string;
    index: number;
    round: number;
    preview: string;
  };

  let {
    rounds = [],
    activeId = undefined,
    onSelect = () => {},
  }: {
    rounds?: RoundEntry[];
    activeId?: string;
    onSelect?: (round: RoundEntry) => void;
  } = $props();

  // 受控展开状态：开合由四个显式路径驱动——鼠标进入 / 鼠标离开边界 / 焦点进入 / 焦点离开 / ESC
  let expanded = $state(false);

  /**
   * 焦点离开：focusout 会冒泡（blur 不冒泡），必须用 relatedTarget 判断
   * 新焦点是否仍在容器内；在外部才收起。
   */
  function handleFocusOut(event: FocusEvent) {
    const container = event.currentTarget as HTMLElement;
    if (container.contains(event.relatedTarget as Node)) return;
    expanded = false;
  }

  // ESC 收起：仅在展开时监听，收起后自动移除
  $effect(() => {
    if (!expanded || typeof window === "undefined") return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") expanded = false;
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });
</script>

{#if rounds.length >= 2}
  <!--
    外层：贴右侧、垂直居中。
    - onmouseenter：进入组件区域 → 展开
    - onmouseleave：真正离开容器（含全部后代）边界 → 收起。
      之所以用 mouseleave 而不是 mouseout + relatedTarget：
        * mouseleave 不冒泡，且仅在指针几何上离开元素边界时触发一次，
          天然避免「子元素之间移动 / gap 空隙 / relatedTarget 为 null
          或指向被替换节点」等导致的判断失准；
        * mouseout 需要逐次比对 relatedTarget，边界不可控，
          这正是原实现「已离开但不收起」的根因。
    - focusin / focusout：键盘 Tab 进入 → 展开，Tab 移出 → 收起。
      点击某行只触发 onSelect 跳转，不改变 expanded，避免"点击即收起"的突兀。

    svelte-ignore a11y_mouse_events_have_key_events：
      改用 mouseenter / mouseleave 后通常不再触发该 a11y 警告；
      为兼容不同 Svelte 补丁版本对"冗余 ignore"的处理差异保留此行，
      若 CI 对 unused ignore 零容忍可整行删除，不影响功能。
  -->
  <div
    class="group absolute inset-y-0 right-2 z-20 flex items-center"
    role="navigation"
    aria-label="对话轮次快速导航"
    onmouseenter={() => (expanded = true)}
    onmouseleave={() => (expanded = false)}
    onfocusin={() => (expanded = true)}
    onfocusout={handleFocusOut}
  >
    <!--
      面板 = 列表本身。
      - 收起：w-8，仅容纳横条，背景透明。
      - 展开：w-72，背景浮现。
      - 每行 justify-end，横条贴右，宽度变化只向左生长，横条绝对位置不变。
    -->
    <div
      class="overflow-hidden rounded-xl border transition-all duration-200 {expanded
        ? 'w-72 border-border/50 bg-popover/95 shadow-xl backdrop-blur-md'
        : 'w-8 border-transparent'}"
    >
      <div class="flex flex-col gap-0.5 py-2" use:autoAnimate>
        {#each rounds as r (r.id)}
          <button
            type="button"
            onclick={() => onSelect(r)}
            aria-label={`跳转到第 ${r.round} 轮：${r.preview}`}
            aria-current={r.id === activeId ? "true" : undefined}
            class="flex w-full items-center justify-end gap-2 rounded-lg py-1 pl-1.5 pr-1 transition-colors hover:bg-accent"
          >
            <span
              class="min-w-0 flex-1 truncate whitespace-nowrap text-left text-xs text-foreground transition-opacity duration-200 {expanded
                ? 'opacity-100'
                : 'opacity-0'}"
            >
              {r.preview}
            </span>
            <span
              class="h-1 w-3 shrink-0 rounded-full transition-colors duration-200 {r.id ===
              activeId
                ? 'bg-primary'
                : expanded
                  ? 'bg-muted-foreground/60'
                  : 'bg-muted-foreground/40'}"
            ></span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
