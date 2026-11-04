<!-- packages/renderer/src/lib/components/leftside/session/session.item.svelte -->
<script lang="ts">
  import { i18nStore } from "$lib/store/i18n.svelte";
  import type { ChatSession } from "$lib/store/local/chat.types";
  import { sessionStore } from "$lib/store/local/session.store.svelte";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import { IconEdit, IconTrash } from "@tabler/icons-svelte";

  let { session }: { session: ChatSession } = $props();

  let isEditing = $state(false);
  let editingTitle = $state("");
  let inputRef: HTMLInputElement | undefined = $state();

  const isActive = $derived(sessionStore.activeSessionId === session.id);

  function formatRelativeTime(timestamp: number): string {
    return i18nStore.getDayjs()(timestamp).fromNow();
  }

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
    "group/item relative flex items-center gap-2 rounded-xl border transition-all duration-200",
    isActive
      ? "border-primary/20 bg-primary/5"
      : "border-transparent bg-background hover:border-border/50 hover:bg-accent/40",
  ]}
>
  <button
    class="flex min-w-0 flex-1 flex-col gap-1 px-3 py-3 text-left"
    onclick={() => sessionStore.setActiveSession(session.id)}
  >
    {#if isEditing}
      <input
        bind:this={inputRef}
        type="text"
        bind:value={editingTitle}
        class="w-full rounded-lg border border-border/50 bg-background px-2 py-1 text-sm font-medium outline-none focus:border-primary"
        onclick={(e) => e.stopPropagation()}
        onblur={saveEdit}
        onkeydown={(e) => {
          if (e.key === "Enter") saveEdit();
          if (e.key === "Escape") cancelEdit();
          e.stopPropagation();
        }}
      />
    {:else}
      <span
        class={[
          "truncate text-sm transition-colors duration-200",
          isActive
            ? "font-medium text-foreground"
            : "font-normal text-foreground/80",
        ]}
      >
        {session.title}
      </span>
    {/if}

    <div class="flex items-center gap-2 text-xs">
      <span
        class={[
          "transition-colors duration-200",
          isActive ? "text-primary/60" : "text-muted-foreground/70",
        ]}
      >
        {formatRelativeTime(session.lastMessageAt ?? session.updatedAt)}
      </span>
      <span class="text-muted-foreground/50">·</span>
      <span class="text-muted-foreground/70">
        {session.messageCount} 条消息
      </span>
    </div>
  </button>

  {#if !isEditing}
    <div
      class="flex shrink-0 gap-1 pr-2 opacity-0 transition-opacity duration-200 group-hover/item:opacity-100 group-focus-within/item:opacity-100"
    >
      <button
        type="button"
        aria-label="重命名会话"
        class="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
        onclick={(e) => {
          e.stopPropagation();
          startEdit();
        }}
      >
        <IconEdit class="size-3.5" stroke={1.5} />
      </button>
      <button
        type="button"
        aria-label="删除会话"
        class="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
        onclick={(e) => {
          e.stopPropagation();
          handleDelete();
        }}
      >
        <IconTrash class="size-3.5" stroke={1.5} />
      </button>
    </div>
  {/if}
</div>
