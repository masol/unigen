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

  // 受控展开状态：开合由三个显式路径驱动——鼠标进入 / 鼠标移出容器 / ESC
  let expanded = $state(false);

  /**
   * 鼠标移出检测：用 mouseout + relatedTarget，而不是 mouseleave。
   * 原因：本容器宽度随 expanded 状态变化（w-8 ↔ w-72），
   * 在收缩动画过程中 mouseleave 可能在边界变化时丢失，
   * 导致“鼠标已移出但面板不收起”。mouseout 冒泡 + relatedTarget
   * 是显式判断：只有鼠标真正离开整个容器（relatedTarget 为 null
   * 或不在容器内）时才收起，在行与行之间移动不会误触发。
   */
  function handleMouseOut(event: MouseEvent) {
    const container = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (related && container.contains(related)) return;
    expanded = false;
  }

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
    - onmouseout：用 relatedTarget 判断是否真正移出容器 → 收起
    - focusin / focusout：键盘 Tab 进入 → 展开，Tab 移出 → 收起
    点击某行只触发 onSelect 跳转，不改变 expanded，避免“点击即收起”的突兀。

    关于下方 svelte-ignore：a11y_mouse_events_have_key_events 按事件名
    强制要求 mouseout 配对 blur。但 blur 不冒泡，无法表达“焦点离开整个
    子树”的语义；我们用的 focusout 才是 blur 的冒泡等价物，功能上已完整
    覆盖键盘路径。该警告在此为误报，故显式忽略。
  -->
  <!-- svelte-ignore a11y_mouse_events_have_key_events -->
  <div
    class="group absolute inset-y-0 right-2 z-20 flex items-center"
    role="navigation"
    aria-label="对话轮次快速导航"
    onmouseenter={() => (expanded = true)}
    onmouseout={handleMouseOut}
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
