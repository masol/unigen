<script lang="ts">
  import { IconSearch, IconX } from "@tabler/icons-svelte";
  import { kbSearchStore } from "./store.svelte";

  function submitSearch() {
    void kbSearchStore.search();
  }
</script>

<div class="flex h-8 w-full min-w-0 items-center gap-1.5">
  <div
    class="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border/50 bg-background px-2 transition-all duration-200 focus-within:border-primary/40"
  >
    <IconSearch class="size-4 shrink-0 text-muted-foreground" />
    <input
      type="text"
      placeholder="检索知识库片段…"
      value={kbSearchStore.query}
      class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      spellcheck="false"
      autocomplete="off"
      oninput={(e) => {
        kbSearchStore.query = (e.target as HTMLInputElement)?.value;
      }}
      onkeydown={(e) => {
        if (e.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          submitSearch();
        }
      }}
      oncompositionend={(e) => {
        kbSearchStore.query = (e.target as HTMLInputElement)?.value;
      }}
    />
    {#if kbSearchStore.query}
      <button
        type="button"
        class="shrink-0 text-muted-foreground transition-all duration-200 hover:text-foreground"
        onclick={() => kbSearchStore.clearSearch()}
        aria-label="清空检索"
      >
        <IconX class="size-3.5" />
      </button>
    {/if}
  </div>
</div>
