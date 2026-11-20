<!-- 消息导航 Minimap · 显示条件由父级 visible 控制（可滚动即可显示，含"一条长消息"场景）-->
<!-- role 图标区分 · scrollspy 高亮 · 点击平滑跳转 · pointer-events 分层避免截断下层点击 -->
<script lang="ts">
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

  // 仅渲染非空（有正文）消息作为导航条目；空的 assistant 占位、被清空的消息不出现在索引中
  let visibleMessages = $derived(
    messages.filter((m) => (m.content ?? "").trim().length > 0),
  );

  const PREVIEW_MAX = 60;

  function previewOf(content: string | undefined, role: string): string {
    const flat = (content ?? "").replace(/\s+/g, " ").trim();
    if (!flat) return role === "user" ? "（空消息）" : "（AI 回复）";
    return flat.length > PREVIEW_MAX ? flat.slice(0, PREVIEW_MAX) + "…" : flat;
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
            aria-label={`跳转到消息：${previewOf(msg.content, msg.role)}`}
            aria-current={isActive ? "true" : undefined}
            class="flex w-full items-center justify-end gap-2 rounded-lg py-1 pl-1.5 pr-1 transition-colors hover:bg-accent"
          >
            {#if expanded}
              <span
                class="flex size-5 shrink-0 items-center justify-center {isActive
                  ? 'text-primary'
                  : 'text-muted-foreground'}"
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
                {previewOf(msg.content, msg.role)}
              </span>
            {/if}
            <span
              class="h-1 shrink-0 rounded-full transition-all duration-200 {isActive
                ? 'w-4 bg-primary'
                : expanded
                  ? 'w-3 bg-muted-foreground/50'
                  : 'w-3 bg-muted-foreground/40'}"
            ></span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
