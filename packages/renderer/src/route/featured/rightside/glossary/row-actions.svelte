<!-- $lib/components/glossary/glossary-row-actions.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { confirmStore } from "$lib/store/ui/confirm.svelte.js";
  import {
    IconDotsVertical,
    IconEdit,
    IconFileText,
    IconTrash,
  } from "@tabler/icons-svelte";
  import { push } from "svelte-spa-router";
  import { blueprintStore, type BlueprintTerm } from "./store.svelte.js";

  let { term }: { term: BlueprintTerm } = $props();

  // 是否允许「编辑内容」——由 store 决定（当前固定 true，逻辑由你实现）
  const canEditContent = $derived(blueprintStore.canEditContent(term));

  function handleEdit() {
    push(`/editor/${blueprintStore.kind}/${term.name}/`);
  }

  function handleEditContent() {
    push(`/editor/${blueprintStore.kind}/${term.name}/true`);
  }

  async function handleDelete() {
    const confirmed = await confirmStore.request({
      title: "删除条目？",
      message: `“${term.name}” 将被永久移除，此操作不可撤销。`,
      confirmLabel: "删除",
    });
    if (confirmed === null) return;
    if (confirmed) {
      await blueprintStore.removeTerm(term.name);
    }
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="icon"
        class="size-8 rounded-lg text-muted-foreground transition-all duration-200"
      >
        <span class="sr-only">打开操作菜单</span>
        <IconDotsVertical size={20} stroke={1.5} />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="rounded-xl">
    <DropdownMenu.Item class="rounded-lg" onclick={handleEdit}>
      <IconEdit size={20} stroke={1.5} />
      编辑
    </DropdownMenu.Item>
    {#if canEditContent}
      <DropdownMenu.Item class="rounded-lg" onclick={handleEditContent}>
        <IconFileText size={20} stroke={1.5} />
        编辑内容
      </DropdownMenu.Item>
    {/if}
    <DropdownMenu.Separator />
    <DropdownMenu.Item
      class="rounded-lg text-destructive focus:text-destructive"
      onclick={handleDelete}
    >
      <IconTrash size={20} stroke={1.5} />
      删除
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
