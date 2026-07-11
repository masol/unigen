<!-- src/lib/components/dyn/nodes/FieldNode.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { dialogStore } from "$lib/store/ui/dialog.svelte";
  import { IconPencil } from "@tabler/icons-svelte";
  import type { FieldNode } from "../ast";
  import ScriptSegmentDialog from "../dialog/ScriptSegmentDialog.svelte";
  import { readString, writeKeyOf, type ValueService } from "../value-service";

  let { node, service }: { node: FieldNode; service: ValueService } = $props();

  let loading = $derived(service.isLoading);
  let value = $derived(readString(service, node.binding.readKey));
  const writeKey = writeKeyOf(node.binding);

  // inline 编辑态
  let isEditing = $state(false);
  let tempValue = $state("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let inputRef: any = null;

  function startInline() {
    if (loading || node.readonly) return;
    tempValue = value;
    isEditing = true;
    setTimeout(() => {
      inputRef?.focus();
      inputRef?.select();
    }, 0);
  }

  async function saveInline() {
    if (loading) return;
    const trimmed = tempValue.trim();
    if (trimmed && trimmed !== value) {
      await service.set(writeKey, trimmed);
    }
    isEditing = false;
  }

  function cancelInline() {
    isEditing = false;
  }

  function inlineKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveInline();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelInline();
    }
  }

  async function editDialog() {
    if (loading || node.readonly) return;
    const content = await dialogStore.safeShow(
      ScriptSegmentDialog,
      {
        title: node.dialogTitle ?? `编辑${node.label}`,
        description: node.dialogDescription,
        placeholder: node.placeholder,
        initialText: value,
        alert: node.alert,
      },
      { size: "xl" },
    );
    if (content === null) return;
    await service.set(writeKey, content);
  }
</script>

{#if node.editor === "inline"}
  <!-- ╭─ inline：就地单行编辑 ─╮ -->
  <div
    class="group relative rounded-xl border border-border/50 bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md"
  >
    {#if isEditing}
      <div class="flex items-center gap-2">
        <Input
          id={`field-${node.binding.readKey}`}
          bind:this={inputRef}
          bind:value={tempValue}
          class="rounded-lg flex-1 h-8 text-sm"
          placeholder={node.placeholder}
          onblur={saveInline}
          onkeydown={inlineKeydown}
          disabled={loading}
        />
        <Button
          size="sm"
          variant="ghost"
          class="h-7 rounded-lg px-2 text-xs"
          onclick={cancelInline}
          disabled={loading}
        >
          取消
        </Button>
      </div>
    {:else}
      <div class="flex items-center justify-between gap-3">
        <div class="flex-1 min-w-0">
          <label
            for={`field-${node.binding.readKey}`}
            class="block text-xs text-muted-foreground mb-1"
          >
            {node.label}
          </label>
          <button
            class="text-sm font-medium text-foreground hover:text-primary transition-colors duration-200 text-left truncate w-full"
            onclick={startInline}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                startInline();
              }
            }}
          >
            {value || node.emptyHint || "未设置"}
          </button>
        </div>
        <Button
          size="icon"
          variant="ghost"
          class="h-7 w-7 rounded-lg shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          onclick={startInline}
          disabled={loading}
          aria-label={`编辑${node.label}`}
        >
          <IconPencil size={14} stroke={1.5} />
        </Button>
      </div>
    {/if}
  </div>
{:else}
  <!-- ╭─ dialog：点击弹对话框编辑多行 ─╮ -->
  <button
    class="group w-full text-left rounded-xl border border-border/50 bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border"
    onclick={editDialog}
    disabled={loading || node.readonly}
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <div class="text-xs text-muted-foreground mb-1.5">
          {node.label}
          {#if node.readonly}
            <span class="text-muted-foreground/50">（未实现）</span>
          {/if}
        </div>
        {#if value}
          <p class="text-sm text-foreground/80 leading-relaxed line-clamp-2">
            {value}
          </p>
        {:else}
          <p class="text-sm text-muted-foreground/60 italic">
            {node.emptyHint || `点击添加${node.label}`}
          </p>
        {/if}
      </div>
      <IconPencil
        size={14}
        stroke={1.5}
        class="shrink-0 mt-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
    </div>
  </button>
{/if}
