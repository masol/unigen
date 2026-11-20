<!-- packages/renderer/src/lib/components/leftside/session/session.item.svelte -->
<script lang="ts">
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Marquee } from "$lib/components/ui/marquee";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { i18nStore } from "$lib/store/i18n.svelte";
  import type { ChatSession } from "$lib/store/local/chat.types";
  import { sessionStore } from "$lib/store/local/session.store.svelte";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import {
    IconCheck,
    IconDotsVertical,
    IconEdit,
    IconLoader2,
    IconPin,
    IconProgress,
    IconTrash,
    IconX,
  } from "@tabler/icons-svelte";

  let { session }: { session: ChatSession } = $props();

  let isEditing = $state(false);
  let editingTitle = $state("");
  let inputRef: HTMLInputElement | undefined = $state();

  // 切换会话是异步的：期间禁用本条目交互并展示内联 spinner。
  let isSwitching = $state(false);

  // 仅用于控制三点按钮的常显态；菜单的开关/定位/关闭由 Bits 接管。
  let isMenuOpen = $state(false);

  // 标题悬停滚动状态
  let isTitleHovered = $state(false);
  let isTitleOverflowing = $state(false);
  let titleContentWidth = $state(0);
  let titleContainerRef: HTMLDivElement | undefined = $state();
  let titleMeasureRef: HTMLSpanElement | undefined = $state();

  const isActive = $derived(sessionStore.activeSessionId === session.id);
  // 运行状态与 active/switching 正交，作为独立派生读取
  const isRunning = $derived(sessionStore.isRunning(session.id));
  const titleToneClass = $derived(
    isRunning
      ? "font-medium text-primary"
      : isActive
        ? "font-medium text-foreground"
        : "text-foreground/80",
  );
  const marqueeSpeed = $derived(
    Math.max(6, Math.min(45, (titleContentWidth + 32) / 40)),
  );

  function measureTitleOverflow() {
    const containerEl = titleContainerRef;
    const measureEl = titleMeasureRef;
    if (!containerEl || !measureEl) return;

    const contentWidth = measureEl.scrollWidth;
    titleContentWidth = contentWidth;
    isTitleOverflowing = contentWidth > containerEl.clientWidth + 1;
  }

  // 标题文本变化会改变 titleMeasureRef 的尺寸，从而经 ResizeObserver 触发重新测量，
  // 无需再显式追踪 session.title。
  $effect(() => {
    const containerEl = titleContainerRef;
    const measureEl = titleMeasureRef;
    if (!containerEl || !measureEl) return;

    // 首次布局测量：兜底 ResizeObserver 在某些浏览器下的首帧时序差异。
    const rafId = requestAnimationFrame(() => measureTitleOverflow());

    const observer = new ResizeObserver(() => measureTitleOverflow());
    observer.observe(containerEl);
    observer.observe(measureEl);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  });

  function handleTitleMouseEnter() {
    measureTitleOverflow();
    isTitleHovered = true;
  }

  function handleTitleMouseLeave() {
    isTitleHovered = false;
  }

  function startEdit() {
    isTitleHovered = false;
    isEditing = true;
    editingTitle = session.title;
    setTimeout(() => {
      inputRef?.focus();
      inputRef?.select();
    }, 0);
  }

  async function saveEdit() {
    if (!isEditing) return;

    const nextTitle = editingTitle.trim();
    isEditing = false;
    editingTitle = "";

    if (nextTitle && nextTitle !== session.title) {
      await sessionStore.updateSessionTitle(session.id, nextTitle);
    }
  }

  function cancelEdit() {
    isEditing = false;
    editingTitle = "";
  }

  async function handleSelect() {
    if (isEditing || isSwitching || isActive) return;
    isSwitching = true;
    try {
      await sessionStore.setActiveSession(session.id);
    } finally {
      isSwitching = false;
    }
  }

  async function handlePinToggle() {
    await sessionStore.setPinned(session.id, !session.pinned);
  }

  async function handleDelete() {
    const ok = await confirmStore.request({
      title: "删除会话？",
      message: `即将删除会话「${session.title}」及其所有消息，此操作不可撤销。`,
    });

    if (ok) {
      await sessionStore.deleteSession(session.id);
    }
  }
</script>

<div
  class={[
    "group/item relative flex h-9 min-w-0 items-center rounded-lg transition-colors duration-150",
    isActive
      ? "bg-primary/10"
      : isRunning
        ? "bg-primary/6 hover:bg-primary/10"
        : "hover:bg-accent/60",
    isSwitching ? "opacity-60" : "",
  ]}
>
  {#if isEditing}
    <div class="flex min-w-0 flex-1 items-center gap-1 px-1.5">
      <input
        bind:this={inputRef}
        type="text"
        bind:value={editingTitle}
        class="h-7 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-sm font-medium outline-none focus:border-primary"
        onblur={saveEdit}
        onkeydown={(e) => {
          if (e.key === "Enter") saveEdit();
          if (e.key === "Escape") cancelEdit();
          e.stopPropagation();
        }}
      />
      <button
        type="button"
        aria-label="保存标题"
        class="flex size-7 shrink-0 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10"
        onmousedown={(e) => e.preventDefault()}
        onclick={saveEdit}
      >
        <IconCheck class="size-4" stroke={1.5} />
      </button>
      <button
        type="button"
        aria-label="取消编辑"
        class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onmousedown={(e) => e.preventDefault()}
        onclick={cancelEdit}
      >
        <IconX class="size-4" stroke={1.5} />
      </button>
    </div>
  {:else}
    <!-- 该 wrapper 仅用于侦测悬停以驱动 marquee，交互语义由内部 button 承担，故标记为 presentation -->
    <div
      role="presentation"
      class="relative flex h-full min-w-0 flex-1 items-center"
      onmouseenter={handleTitleMouseEnter}
      onmouseleave={handleTitleMouseLeave}
    >
      <Tooltip.Root delayDuration={1500}>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              aria-label={session.title}
              class="absolute inset-0 rounded-md text-left disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              disabled={isSwitching}
              onclick={handleSelect}
            ></button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content
          side="right"
          class="max-w-xs whitespace-normal wrap-break-word text-xs"
        >
          <div class="space-y-1">
            <div>创建：{i18nStore.dayjs(session.createdAt).fromNow()}</div>
            <div>
              最后更新：{i18nStore
                .dayjs(session.lastMessageAt ?? session.updatedAt)
                .fromNow()}
            </div>
            <div>消息数：{session.messageCount}</div>
          </div>
        </Tooltip.Content>
      </Tooltip.Root>

      <div
        aria-hidden="true"
        class="pointer-events-none flex h-full min-w-0 flex-1 items-center gap-1.5 px-2.5"
      >
        {#if isRunning}
          <IconProgress
            class="size-3.5 shrink-0 animate-spin text-primary"
            stroke={2}
          />
        {/if}

        <div
          bind:this={titleContainerRef}
          class="relative min-w-0 flex-1 overflow-hidden"
        >
          <span
            bind:this={titleMeasureRef}
            class={[
              "pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap text-sm",
              titleToneClass,
            ]}
          >
            {session.title}
          </span>

          {#if isTitleHovered && isTitleOverflowing}
            <Marquee
              class="w-full"
              direction="left"
              speed={marqueeSpeed}
              gap={32}
              repeat={2}
            >
              <span class={["whitespace-nowrap text-sm", titleToneClass]}>
                {session.title}
              </span>
            </Marquee>
          {:else}
            <span class={["block truncate text-sm", titleToneClass]}>
              {session.title}
            </span>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if isSwitching}
    <IconLoader2
      class="mr-2 size-3.5 shrink-0 animate-spin text-primary"
      stroke={1.5}
    />
  {:else if !isEditing}
    <DropdownMenu.Root bind:open={isMenuOpen}>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            aria-label="会话操作"
            class={[
              "mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity duration-150 hover:bg-accent hover:text-foreground",
              isMenuOpen
                ? "opacity-100"
                : "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
            ]}
          >
            <IconDotsVertical class="size-4" stroke={1.5} />
          </button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" sideOffset={4} class="w-36">
        <DropdownMenu.Item onSelect={handlePinToggle} class="gap-2 text-xs">
          <IconPin class="size-3.5" stroke={1.5} />
          {session.pinned ? "取消置顶" : "置顶"}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={startEdit} class="gap-2 text-xs">
          <IconEdit class="size-3.5" stroke={1.5} />
          重命名
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          onSelect={handleDelete}
          class="gap-2 text-xs text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
        >
          <IconTrash class="size-3.5" stroke={1.5} />
          删除
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}
</div>
