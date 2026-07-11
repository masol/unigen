<!-- src/lib/components/dyn/nodes/TextListNode.svelte -->
<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { i18nStore } from "$lib/store/i18n.svelte";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import { dialogStore } from "$lib/store/ui/dialog.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconAlertTriangle,
    IconBook2,
    IconLoader2,
    IconPencil,
    IconPlus,
    IconTrash,
  } from "@tabler/icons-svelte";
  import type { TextListNode } from "../ast";
  import ScriptSegmentDialog from "../dialog/ScriptSegmentDialog.svelte";
  import { readList, writeKeyOf, type ValueService } from "../value-service";

  let { node, service }: { node: TextListNode; service: ValueService } =
    $props();

  interface ListItem {
    id: string;
    size?: number;
    updatedAt?: number | string;
  }

  let loading = $derived(service.isLoading);
  let error = $derived(service.error);
  let items = $derived(readList<ListItem>(service, node.binding.readKey));
  // svelte-ignore state_referenced_locally
  const writeKey = writeKeyOf(node.binding);

  async function handleAppend() {
    if (loading) return;
    const content = await dialogStore.safeShow(
      ScriptSegmentDialog,
      { title: node.addDialogTitle ?? "添加", initialText: "" },
      { size: "xl" },
    );
    if (content === null) return;
    await service.listAppend(writeKey, content);
  }

  async function handleEdit(item: ListItem) {
    if (loading) return;
    const orig = await service.getItemContent(node.binding.readKey, item.id);
    const content = await dialogStore.safeShow(
      ScriptSegmentDialog,
      {
        title: node.editDialogTitle ?? "编辑",
        description: node.editDialogDescription,
        initialText: orig ?? "",
        alert: node.editAlert,
      },
      { size: "xl" },
    );
    if (content === null) return;
    await service.listUpdate(writeKey, item.id, content);
  }

  async function handleDelete(item: ListItem, index: number) {
    if (loading) return;
    const ok = await confirmStore.request({
      title: "删除",
      message: `确定要删除第 ${index + 1} 项吗？此操作无法撤销。`,
    });
    if (!ok) return;
    await service.listRemove(writeKey, item.id);
  }
</script>

<div class="space-y-3">
  {#if error}
    <div
      class="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      role="alert"
    >
      <IconAlertTriangle size={16} stroke={1.5} class="mt-0.5 shrink-0" />
      <span class="whitespace-pre-wrap wrap-break-word">{error}</span>
    </div>
  {/if}

  <Button
    class="w-full rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
    onclick={handleAppend}
    disabled={loading}
  >
    {#if loading}
      <IconLoader2 size={18} stroke={1.5} class="animate-spin" />
      处理中…
    {:else}
      <IconPlus size={18} stroke={1.5} />
      {node.addLabel}
    {/if}
  </Button>

  <ScrollArea class="h-87.5 pr-2">
    {#if items.length > 0}
      <div
        use:autoAnimate
        class="space-y-3 transition-opacity duration-200"
        class:pointer-events-none={loading}
        class:opacity-60={loading}
        aria-busy={loading}
      >
        {#each items as item, i (item.id)}
          <div
            class="group relative rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
          >
            <div class="flex items-center gap-2">
              <Badge
                variant="secondary"
                class="rounded-lg px-2 py-0.5 text-xs font-medium"
              >
                第 {i + 1} 项
              </Badge>
              <span class="text-xs text-muted-foreground">
                {item.size ?? 0} 字
              </span>
            </div>
            {#if item.updatedAt}
              <p
                class="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground opacity-70 line-clamp-4"
              >
                {i18nStore.dayjs(item.updatedAt).fromNow()}
              </p>
            {/if}
            <div
              class="absolute right-4 top-4 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              <Button
                size="icon"
                variant="ghost"
                class="h-7 w-7 rounded-lg"
                onclick={() => handleEdit(item)}
                disabled={loading}
                aria-label="编辑"
              >
                <IconPencil size={14} stroke={1.5} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                onclick={() => handleDelete(item, i)}
                disabled={loading}
                aria-label="删除"
              >
                <IconTrash size={14} stroke={1.5} />
              </Button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div
        class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/20 p-12 text-center"
      >
        <div
          class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
        >
          {#if node.emptyIcon}
            <RuntimeIcon name={node.emptyIcon} size={20} stroke={1.5} />
          {:else}
            <IconBook2 size={20} stroke={1.5} />
          {/if}
        </div>
        <p class="text-sm font-medium">{node.emptyTitle}</p>
      </div>
    {/if}
  </ScrollArea>
</div>
