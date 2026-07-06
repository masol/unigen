<!-- $lib/components/glossary/glossary-blueprint-switcher.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { IconCheck, IconChevronDown } from "@tabler/icons-svelte";
  import {
    BLUEPRINT_OPTIONS,
    blueprintStore,
    type BlueprintKind,
  } from "./store.svelte.js";
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        class="-ms-2 h-9 gap-1.5 rounded-xl px-2 text-lg font-medium tracking-tight transition-all duration-200"
      >
        {blueprintStore.kindLabel}
        <IconChevronDown size={20} stroke={1.5} class="text-muted-foreground" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start" class="min-w-40 rounded-xl">
    {#each BLUEPRINT_OPTIONS as opt (opt.value)}
      <DropdownMenu.Item
        class="rounded-lg"
        onclick={() => blueprintStore.setKind(opt.value as BlueprintKind)}
      >
        <span class="flex-1">{opt.label}</span>
        {#if blueprintStore.kind === opt.value}
          <IconCheck size={20} stroke={1.5} class="text-primary" />
        {/if}
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
