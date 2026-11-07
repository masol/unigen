<!-- packages/renderer/src/lib/components/leftside/session/session.item.svelte -->
<script lang="ts">
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
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

  const isActive = $derived(sessionStore.activeSessionId === session.id);
  const createdText = $derived(
    i18nStore.dayjs(session.createdAt).format("YYYY-MM-DD HH:mm"),
  );
  const updatedText = $derived(
    i18nStore
      .dayjs(session.lastMessageAt ?? session.updatedAt)
      .format("YYYY-MM-DD HH:mm"),
  );

  function startEdit() {
    isEditing = true;
    editingTitle = session.title;
    setTimeout(() => {
      inputRef?.focus();
      inputRef?.select();
    }, 0);
  }

  async function saveEdit() {
    if (editingTitle.trim() && editingTitle !== session.title) {
      await sessionStore.updateSessionTitle(session.id, editingTitle.trim());
    }
    isEditing = false;
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
    isActive ? "bg-primary/10" : "hover:bg-accent/60",
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
    <!-- 单行标题 + 悬停显示会话元信息；超长由 truncate 处理，不会撑出横向滚动 -->
    <Tooltip.Root delayDuration={1500}>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            class="flex h-full min-w-0 flex-1 items-center px-2.5 text-left disabled:pointer-events-none"
            disabled={isSwitching}
            onclick={handleSelect}
          >
            <span
              class={[
                "w-full min-w-0 truncate text-sm",
                isActive ? "font-medium text-foreground" : "text-foreground/80",
              ]}
            >
              {session.title}
            </span>
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content
        side="right"
        class="max-w-xs whitespace-normal wrap-break-word text-xs"
      >
        <div class="space-y-1">
          <div>创建：{i18nStore.dayjs(createdText).fromNow()}</div>
          <div>最后更新：{i18nStore.dayjs(updatedText).fromNow()}</div>
          <div>消息数：{session.messageCount}</div>
        </div>
      </Tooltip.Content>
    </Tooltip.Root>
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
