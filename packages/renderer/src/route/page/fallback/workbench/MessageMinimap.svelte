<!-- 消息导航 Minimap · 显示条件由父级 visible 控制（可滚动即可显示，含"一条长消息"场景）-->
<!-- role 图标/高亮条双色区分 · scrollspy 高亮 · 点击平滑跳转 · pointer-events 分层避免截断下层点击 -->
<script lang="ts">
  import type { ChatMessage } from "$lib/store/local/chat.types";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import { IconRobot, IconUser } from "@tabler/icons-svelte";

  let {
    visible = false,
    activeId = undefined,
    onSelect = () => {},
  }: {
    /** 由父级按"内容可滚动"决定是否渲染（一条长消息也显示） */
    visible?: boolean;
    /** 由外部 scrollspy 计算的当前可视消息 id */
    activeId?: string;
    /** 点击某条消息时回调其 id */
    onSelect?: (id: string) => void;
  } = $props();

  // 受控展开：由鼠标进入 / 离开 / 焦点进入 / 移出 / ESC 五个路径驱动
  let expanded = $state(false);

  let messages = $derived(messageStore.messages);

  /**
   * 只要消息在界面中「能够被定位 / 看到」，就应出现在导航里：
   * - 有正文；
   * - 正在流式生成（streaming，且 TypingDots 已渲染）；
   * - 已有 traces（AI 思考 / 工具段，正文尚未产出）。
   *
   * 关键修复：原先仅凭 content 非空判定，会导致
   * 「AI 思考已可见、正文未输出」的短暂窗口里 minimap 无条目。
   */
  function isRenderable(m: ChatMessage): boolean {
    if ((m.content ?? "").trim().length > 0) return true;
    if (m.streaming === true) return true;
    if (Array.isArray(m.traces) && m.traces.length > 0) return true;
    return false;
  }

  let visibleMessages = $derived(messages.filter(isRenderable));

  const PREVIEW_MAX = 60;

  /**
   * 无正文时的占位文案按状态区分，使 minimise 展开后仍能识别消息进度。
   */
  function previewOf(m: ChatMessage): string {
    const flat = (m.content ?? "").replace(/\s+/g, " ").trim();
    if (flat) {
      return flat.length > PREVIEW_MAX
        ? flat.slice(0, PREVIEW_MAX) + "…"
        : flat;
    }
    if (m.streaming === true) return "…（AI 思考中）";
    if (Array.isArray(m.traces) && m.traces.length > 0) {
      return "…（AI 思考记录）";
    }
    return m.role === "user" ? "（空消息）" : "（AI 回复）";
  }

  /** 用户 = primary（蓝），AI = emerald（绿），双击区分 + 形状双保险。 */
  function iconClass(role: string, active: boolean): string {
    if (role === "user") {
      return active ? "text-primary" : "text-primary/60";
    }
    return active ? "text-emerald-500" : "text-emerald-500/60";
  }

  function barClass(role: string, active: boolean, expanded: boolean): string {
    const w = active ? "w-4" : "w-3";
    if (role === "user") {
      if (active) return `${w} bg-primary`;
      return expanded ? `${w} bg-primary/60` : `${w} bg-primary/50`;
    }
    if (active) return `${w} bg-emerald-500`;
    return expanded ? `${w} bg-emerald-500/60` : `${w} bg-emerald-500/50`;
  }

  function handleFocusOut(event: FocusEvent) {
    const container = event.currentTarget as HTMLElement;
    // focusout 会冒泡（blur 不会）；只有新焦点离开容器才收起
    if (container.contains(event.relatedTarget as Node)) return;
    expanded = false;
  }

  // 仅在展开时监听 ESC；收起后自动卸载监听
  $effect(() => {
    if (!expanded || typeof window === "undefined") return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") expanded = false;
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });

  function handleClick(id: string) {
    onSelect(id);
  }
</script>

{#if visible}
  <div
    class="pointer-events-none absolute right-2 top-1/2 z-20 -translate-y-1/2"
  >
    <div
      class="pointer-events-auto overflow-hidden rounded-xl border transition-all duration-200 {expanded
        ? 'max-h-[60vh] w-72 border-border/50 bg-popover/95 shadow-xl backdrop-blur-md'
        : 'w-8 border-transparent'}"
      role="navigation"
      aria-label="消息导航"
      onmouseenter={() => (expanded = true)}
      onmouseleave={() => (expanded = false)}
      onfocusin={() => (expanded = true)}
      onfocusout={handleFocusOut}
    >
      <div
        class="flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto overflow-x-hidden py-2"
        use:autoAnimate
      >
        {#each visibleMessages as msg (msg.id)}
          {@const isActive = msg.id === activeId}
          <button
            type="button"
            onclick={() => handleClick(msg.id)}
            aria-label={`跳转到消息：${previewOf(msg)}`}
            aria-current={isActive ? "true" : undefined}
            class="flex w-full items-center justify-end gap-2 rounded-lg py-1 pl-1.5 pr-1 transition-colors hover:bg-accent"
          >
            {#if expanded}
              <span
                class="flex size-5 shrink-0 items-center justify-center {iconClass(
                  msg.role,
                  isActive,
                )}"
              >
                {#if msg.role === "user"}
                  <IconUser size={12} stroke={1.5} />
                {:else}
                  <IconRobot size={12} stroke={1.5} />
                {/if}
              </span>
              <span
                class="min-w-0 flex-1 truncate whitespace-nowrap text-left text-xs transition-colors {isActive
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground'}"
              >
                {previewOf(msg)}
              </span>
            {/if}
            <span
              class="h-1 shrink-0 rounded-full transition-all duration-200 {barClass(
                msg.role,
                isActive,
                expanded,
              )}"
            ></span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
