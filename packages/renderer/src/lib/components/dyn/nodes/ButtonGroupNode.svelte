<!-- src/lib/components/dyn/nodes/ButtonGroupNode.svelte -->
<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Label } from "$lib/components/ui/label";
  import { cn } from "$lib/utils";
  import type { ButtonGroupNode } from "../ast";
  import {
    readStringOr,
    writeKeyOf,
    type ValueService,
  } from "../value-service";

  let { node, service }: { node: ButtonGroupNode; service: ValueService } =
    $props();

  let current = $derived(
    readStringOr(service, node.binding.readKey, node.fallback),
  );
  const writeKey = writeKeyOf(node.binding);
  let columns = $derived(node.columns ?? 3);

  async function select(value: string) {
    if (value === current) return;
    await service.set(writeKey, value);
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

  <div
    class="grid gap-3"
    style={`grid-template-columns: repeat(${columns}, minmax(0, 1fr));`}
  >
    {#each node.options as opt (opt.value)}
      {@const isSelected = current === opt.value}
      <button
        type="button"
        onclick={() => select(opt.value)}
        class={cn(
          "relative flex flex-col items-center gap-2 p-3 rounded-2xl text-center",
          "border transition-all duration-200",
          "hover:-translate-y-0.5 hover:shadow-xl",
          isSelected
            ? "border-primary bg-primary/5 shadow-sm"
            : "border-border/50 bg-background hover:border-border",
        )}
      >
        {#if opt.dot}
          <span class={cn("size-2 rounded-full", opt.dot)}></span>
        {/if}
        <span class="text-sm font-medium text-foreground">{opt.label}</span>
        {#if opt.sub}
          <span class="text-[10px] text-muted-foreground leading-tight">
            {opt.sub}
          </span>
        {/if}
      </button>
    {/each}
  </div>
</section>
