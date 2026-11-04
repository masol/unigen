<!-- packages/renderer/src/route/featured/leftside/session/session.header.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { sessionStore } from "$lib/store/local/session.store.svelte";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import { IconPlus, IconSearch, IconTrash, IconX } from "@tabler/icons-svelte";

  async function handleCreate() {
    await sessionStore.createSession();
  }

  async function handleClearAll() {
    if (sessionStore.sessions.length === 0) return;

    const ok = await confirmStore.request({
      title: "清空所有会话？",
      message: `即将删除全部 ${sessionStore.sessions.length} 个会话及其消息记录，此操作不可撤销。`,
    });

    if (ok) {
      await sessionStore.clearAllSessions();
    }
  }

  async function handleDeleteSelected() {
    const count = sessionStore.selectedIds.size;
    if (count === 0) return;

    const ok = await confirmStore.request({
      title: `删除选中的 ${count} 个会话？`,
      message: "删除后无法恢复，确认继续？",
    });

    if (ok) {
      await sessionStore.deleteMultiple([...sessionStore.selectedIds]);
    }
  }
</script>

<div class="shrink-0 space-y-3 px-3 pb-3">
  {#if sessionStore.hasMultiSelect}
    <div
      class="flex items-center gap-2 rounded-xl border border-border/50 bg-accent/30 px-3 py-2"
    >
      <span class="flex-1 text-sm text-foreground">
        已选 {sessionStore.selectedIds.size} 项
      </span>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 rounded-lg px-2 text-xs"
        onclick={() => sessionStore.clearSelection()}
      >
        取消
      </Button>
      <Button
        variant="destructive"
        size="sm"
        class="h-7 rounded-lg px-2 text-xs"
        onclick={handleDeleteSelected}
      >
        <IconTrash class="size-3.5" />
        删除
      </Button>
    </div>
  {:else}
    <div
      class="flex items-center gap-2 rounded-xl border border-border/50 bg-background px-3 py-1.5"
    >
      <IconSearch class="size-4 shrink-0 text-muted-foreground" />
      <input
        type="text"
        placeholder="搜索会话…"
        value={sessionStore.searchQuery}
        oninput={(e) =>
          sessionStore.setSearchQuery((e.target as HTMLInputElement).value)}
        class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        spellcheck="false"
        autocomplete="off"
      />
      {#if sessionStore.searchQuery}
        <button
          class="shrink-0 text-muted-foreground transition-all duration-200 hover:text-foreground"
          onclick={() => sessionStore.clearSearch()}
        >
          <IconX class="size-3.5" />
        </button>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <Button
        variant="default"
        size="sm"
        class="h-9 flex-1 gap-2 rounded-xl"
        onclick={handleCreate}
        disabled={sessionStore.isCreating}
      >
        <IconPlus class="size-4" />
        新建会话
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="h-9 rounded-xl px-3"
        onclick={handleClearAll}
        disabled={sessionStore.sessions.length === 0 || sessionStore.isClearing}
      >
        <IconTrash class="size-4" />
      </Button>
    </div>
  {/if}
</div>
