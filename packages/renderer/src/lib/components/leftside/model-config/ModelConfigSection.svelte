<!-- model-config/ModelConfigSection.svelte -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { cn } from "$lib/utils";
  import type { Icon } from "@tabler/icons-svelte";
  import { IconChevronDown } from "@tabler/icons-svelte";
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    description?: string;
    icon: Icon;
    open: boolean;
    onopenchange: (open: boolean) => void;
    overriddenCount?: number;
    children: Snippet;
  };

  let {
    title,
    description,
    icon: IconComponent,
    open,
    onopenchange,
    overriddenCount = 0,
    children,
  }: Props = $props();
</script>

<Collapsible.Root {open} onOpenChange={onopenchange}>
  <div
    class={cn(
      "overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200",
      overriddenCount > 0
        ? "border-primary/30 border-l-2 border-l-primary"
        : "border-border/50",
    )}
  >
    <Collapsible.Trigger
      class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-accent/40"
    >
      <div
        class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted"
      >
        <IconComponent size={16} stroke={1.5} class="text-muted-foreground" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class="truncate text-sm font-medium">{title}</span>
          {#if overriddenCount > 0}
            <Badge
              variant="secondary"
              class="h-4 shrink-0 rounded-full px-1.5 text-[10px] font-normal text-primary"
            >
              {overriddenCount}
            </Badge>
          {/if}
        </div>
        {#if description}
          <p class="truncate text-[11px] text-muted-foreground">
            {description}
          </p>
        {/if}
      </div>
      <IconChevronDown
        size={16}
        stroke={1.5}
        class={cn(
          "shrink-0 text-muted-foreground transition-transform duration-200",
          open && "rotate-180",
        )}
      />
    </Collapsible.Trigger>
    <Collapsible.Content>
      <div class="border-t border-border/40 px-3 py-3 animate-fade-in">
        {@render children()}
      </div>
    </Collapsible.Content>
  </div>
</Collapsible.Root>
