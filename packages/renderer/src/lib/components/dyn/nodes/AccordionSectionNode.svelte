<!-- src/lib/components/dyn/nodes/AccordionSectionNode.svelte -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import * as Accordion from "$lib/components/ui/accordion";
  import { Badge } from "$lib/components/ui/badge";
  import type { IValueService } from "$lib/store/ui/activity/type";
  import { IconLoader2 } from "@tabler/icons-svelte";
  import NodeRenderer from "../NodeRenderer.svelte";
  import { keyOf, type AccordionSectionNode } from "../ast";
  import { coerceList, useBinding } from "../binding.svelte";

  let {
    node,
    service,
  }: { node: AccordionSectionNode; service: IValueService } = $props();

  const OPEN = "self";
  let accordionValue = $state(node.defaultOpen ? OPEN : "");
  let children = $derived(Array.isArray(node.children) ? node.children : []);

  // 删除原来的： let loading = $derived(service.isLoading);

  let countKey = $derived.by(() => {
    if (node.badge !== "count") return undefined;
    const listChild = children.find(
      (c) => "binding" in c && (c as any).binding?.key, // readKey → key
    ) as { binding: { key: string } } | undefined;
    return listChild?.binding.key;
  });

  // count 是在「观察」列表 key（本组件不是变更源）→ 必须 track:true 才能实时更新
  const countBound = useBinding(service, () => ({
    key: countKey ?? "",
    track: true,
  }));

  let loading = $derived(countBound.loading);

  let badgeText = $derived.by(() => {
    if (node.badge !== "count") return node.badge ?? null;
    if (!countKey) return null;
    return String(coerceList(countBound.value).length);
  });
</script>

<Accordion.Root type="single" bind:value={accordionValue} class="w-full">
  <Accordion.Item
    value={OPEN}
    class="rounded-2xl border border-border/50 bg-card"
  >
    <Accordion.Trigger
      class="rounded-2xl px-6 py-4 hover:no-underline hover:bg-muted/40 transition-all duration-200"
    >
      <div class="flex w-full items-center gap-3">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          {#if node.icon}
            <RuntimeIcon name={node.icon} size={18} stroke={1.5} />
          {/if}
        </div>
        <h3 class="text-base font-medium tracking-tight">{node.title}</h3>
        {#if loading}
          <IconLoader2
            size={16}
            stroke={1.5}
            class="ml-2 animate-spin text-muted-foreground"
          />
        {/if}
        {#if badgeText !== null}
          <Badge
            variant="secondary"
            class="ml-auto rounded-lg px-2 py-0.5 text-xs"
          >
            {badgeText}
          </Badge>
        {/if}
      </div>
    </Accordion.Trigger>

    <Accordion.Content class="px-3 pb-4">
      <div class="space-y-3">
        <div class="space-y-3">
          {#each children as child, i (keyOf(child, i))}
            <NodeRenderer node={child} {service} />
          {/each}
        </div>
      </div>
    </Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
