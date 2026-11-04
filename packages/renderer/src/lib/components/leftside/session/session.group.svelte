<!-- packages/renderer/src/lib/components/leftside/session/session.group.svelte -->
<script lang="ts">
  import type { TimeGroup } from "$lib/store/local/session.store.svelte";
  import { IconChevronDown } from "@tabler/icons-svelte";

  let {
    group,
    isOpen,
    onToggle,
  }: {
    group: TimeGroup;
    isOpen: boolean;
    onToggle: () => void;
  } = $props();
</script>

<button
  type="button"
  onclick={onToggle}
  class="group flex w-full items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 hover:bg-accent/60"
>
  <span
    class="flex-1 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
  >
    {group.label}
  </span>

  <span
    class="inline-flex h-5 min-w-5 items-center justify-center rounded-lg bg-muted px-1.5 text-xs tabular-nums text-muted-foreground"
  >
    {group.sessions.length}
  </span>

  <IconChevronDown
    class="size-3.5 text-muted-foreground transition-transform duration-200 {isOpen
      ? ''
      : '-rotate-90'}"
    stroke={1.5}
  />
</button>
