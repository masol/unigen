<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { IconLoader2, IconTrash } from "@tabler/icons-svelte";
  import type { ProjectType } from "./types";

  type Props = {
    type: ProjectType;
    deleting?: boolean;
    onUninstall?: () => void;
  };
  let { type, deleting = false, onUninstall }: Props = $props();
</script>

<div
  class="group relative flex h-full flex-col gap-3 rounded-2xl border border-border/50 bg-card
           p-5 shadow-sm transition-all duration-200 hover:border-border hover:shadow-md
           {deleting ? 'pointer-events-none opacity-40' : ''}"
>
  <button
    type="button"
    onclick={onUninstall}
    disabled={deleting}
    aria-label="卸载 {type.name}"
    class="absolute right-3 top-3 flex size-7 items-center justify-center rounded-lg
               text-muted-foreground opacity-0 transition-all duration-200
               hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
               group-hover:opacity-100"
  >
    {#if deleting}
      <IconLoader2 class="size-4 animate-spin" />
    {:else}
      <IconTrash class="size-4" />
    {/if}
  </button>

  <div class="flex items-start gap-3">
    <span
      class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted
                   text-muted-foreground"
    >
      <RuntimeIcon name={type.icon} size={24} />
    </span>
    <div class="min-w-0 flex-1 space-y-0.5 pr-6">
      <p class="truncate text-sm font-semibold text-foreground">{type.name}</p>
      {#if type.author}
        <p class="truncate text-xs text-muted-foreground">{type.author}</p>
      {/if}
    </div>
  </div>

  <p class="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
    {type.description}
  </p>

  {#if type.version}
    <div class="mt-auto pt-1">
      <span
        class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
      >
        v{type.version}
      </span>
    </div>
  {/if}
</div>
