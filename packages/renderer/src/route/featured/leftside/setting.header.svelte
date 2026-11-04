<!-- $lib/components/panels/SettingsSearchBar.svelte -->
<script lang="ts">
  import { IconSearch, IconX } from "@tabler/icons-svelte";
  import { settingsPanelStore } from "./settingStore.svelte";
</script>

<div class="flex h-full w-full min-w-0 items-center gap-1.5 px-1">
  <div
    class="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border/50 bg-background px-2 transition-all duration-200 focus-within:border-primary/40"
  >
    <IconSearch class="size-4 shrink-0 text-muted-foreground" />
    <input
      type="text"
      placeholder="搜索设置…"
      bind:value={settingsPanelStore.searchQuery}
      class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      spellcheck="false"
      autocomplete="off"
      oninput={(e) => {
        settingsPanelStore.searchQuery = (e.target as HTMLInputElement)?.value;
      }}
      onkeydown={(e) => {
        if (e.isComposing) return;
      }}
      oncompositionend={(e) => {
        settingsPanelStore.searchQuery = (e.target as HTMLInputElement)?.value;
      }}
    />
    {#if settingsPanelStore.searchQuery}
      <button
        class="shrink-0 text-muted-foreground transition-all duration-200 hover:text-foreground"
        onclick={() => settingsPanelStore.clearSearch()}
      >
        <IconX class="size-3.5" />
      </button>
    {/if}
  </div>
</div>
