<!-- src/lib/components/dyn/nodes/SelectNode.svelte -->
<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import { cn } from "$lib/utils";
  import type { SelectNode } from "../ast";
  import {
    readStringOr,
    writeKeyOf,
    type ValueService,
  } from "../value-service";

  let { node, service }: { node: SelectNode; service: ValueService } = $props();

  let current = $derived(
    readStringOr(service, node.binding.readKey, node.fallback),
  );
  let selected = $derived(
    node.options.find((o) => o.value === current) ?? node.options[0],
  );
  const writeKey = writeKeyOf(node.binding);

  async function handleChange(next: string | undefined) {
    if (!next || next === current) return;
    await service.set(writeKey, next);
  }
</script>

<section class="space-y-3">
  <div class="flex items-center gap-2">
    {#if node.icon}
      <RuntimeIcon
        name={node.icon}
        size={16}
        stroke={1.5}
        class="text-muted-foreground"
      />
    {/if}
    <Label
      class="text-xs font-medium text-muted-foreground tracking-wide uppercase"
    >
      {node.label}
    </Label>
  </div>

  <Select.Root type="single" value={current} onValueChange={handleChange}>
    <Select.Trigger class="w-full h-auto min-h-12 rounded-xl py-2.5">
      <span class="flex items-center gap-3 min-w-0">
        {#if selected?.badge}
          <span
            class={cn(
              "shrink-0 inline-flex items-center justify-center min-w-9 px-2 py-1 rounded-lg text-[10px] font-mono font-bold",
              selected.badge.className ?? "bg-primary/10 text-primary",
            )}
          >
            {selected.badge.text}
          </span>
        {/if}
        <span class="flex items-baseline gap-2 min-w-0">
          <span class="text-sm font-semibold text-foreground truncate">
            {selected?.label ?? current}
          </span>
          {#if selected?.sub}
            <span class="text-xs text-muted-foreground truncate">
              {selected.sub}
            </span>
          {/if}
        </span>
      </span>
    </Select.Trigger>

    <Select.Content class="rounded-xl max-h-80">
      {#each node.options as option (option.value)}
        <Select.Item
          value={option.value}
          label={option.label}
          class="rounded-lg"
        >
          <div class="flex items-center gap-3 w-full">
            {#if option.badge}
              <span
                class={cn(
                  "shrink-0 inline-flex items-center justify-center min-w-9 px-2 py-1 rounded-lg text-[10px] font-mono font-bold",
                  option.badge.className ?? "bg-primary/10 text-primary",
                )}
              >
                {option.badge.text}
              </span>
            {/if}
            <div class="flex items-baseline gap-2 min-w-0">
              <span class="text-sm font-medium text-foreground">
                {option.label}
              </span>
              {#if option.sub}
                <span class="text-xs text-muted-foreground truncate">
                  {option.sub}
                </span>
              {/if}
            </div>
          </div>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</section>
