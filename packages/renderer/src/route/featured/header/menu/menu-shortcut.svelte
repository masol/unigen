<!-- header/menu/menu-shortcut.svelte -->
<script lang="ts">
  import * as Menubar from "$lib/components/ui/menubar";
  import { configStore } from "$lib/store/config.svelte";

  let { command }: { command: string } = $props();

  const hotkey = $derived(
    configStore.keybinding.getHotkeyForCommand(command) ?? "",
  );
</script>

{#if hotkey}
  <Menubar.Shortcut>{hotkey}</Menubar.Shortcut>
{/if}
