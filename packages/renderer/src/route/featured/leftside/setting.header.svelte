<!-- $lib/components/panels/SettingsSearchBar.svelte -->
<script lang="ts">
  import { IconSearch, IconX } from "@tabler/icons-svelte";
  import { settingsPanelStore } from "./settingStore.svelte";
</script>

<div class="shrink-0 px-1 pb-2">
  <div
    class="flex items-center gap-2 rounded-xl border border-border/50 bg-background px-3 py-1.5"
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
