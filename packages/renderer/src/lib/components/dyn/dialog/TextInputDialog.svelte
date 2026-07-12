<!--
  ╭─────────────────────────────────────────────────────╮
  │ [通用文本输入对话框 → TextInputDialog.svelte]         │
  │ 职责：输入/编辑一段多行文本的极简对话框（业务中立）   │
  │ 契约：onClose(string) 返回文本 / onCancel() 取消      │
  │ 所有文案均可由 props 覆盖，默认值为通用中性词         │
  ╰─────────────────────────────────────────────────────╯
-->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import { Textarea } from "$lib/components/ui/textarea";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import {
    IconAlertTriangle,
    IconDeviceFloppy,
    IconX,
  } from "@tabler/icons-svelte";

  type Props = {
    title?: string;
    description?: string;
    placeholder?: string;
    initialText?: string;
    /** 以警示样式展示 description */
    alert?: boolean;
    /** 保存/取消按钮文案（中立默认） */
    confirmLabel?: string;
    cancelLabel?: string;
    /** 文本域行数 */
    rows?: number;
    /** 是否要求非空才能保存 */
    requireNonEmpty?: boolean;
  } & DialogComponentProps<string>;

  let {
    title = "编辑内容",
    description = "在下方输入文本内容。",
    placeholder = "在此输入…",
    initialText = "",
    alert = false,
    confirmLabel = "保存",
    cancelLabel = "取消",
    rows = 30,
    requireNonEmpty = true,
    onClose,
    onCancel,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(initialText);
  const isValid = $derived(!requireNonEmpty || text.trim().length > 0);

  function handleSave() {
    if (!isValid) return;
    onClose(text.trim());
  }
</script>

<DialogHeader>
  <DialogTitle>{title}</DialogTitle>
  {#if description}
    {#if alert}
      <div
        class="flex items-start gap-2.5 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3"
      >
        <IconAlertTriangle
          size={18}
          stroke={1.5}
          class="mt-0.5 shrink-0 text-destructive"
        />
        <p class="text-sm font-medium leading-relaxed text-destructive">
          {description}
        </p>
      </div>
    {:else}
      <DialogDescription>{description}</DialogDescription>
    {/if}
  {/if}
</DialogHeader>

<div class="py-4">
  <Textarea
    bind:value={text}
    {placeholder}
    {rows}
    class="min-h-48 resize-y rounded-xl border-border/50 bg-background"
  />
</div>

<DialogFooter class="mt-4">
  <Button variant="outline" class="rounded-xl" onclick={() => onCancel()}>
    <IconX class="size-4" />
    {cancelLabel}
  </Button>
  <Button class="rounded-xl" onclick={handleSave} disabled={!isValid}>
    <IconDeviceFloppy class="size-4" />
    {confirmLabel}
  </Button>
</DialogFooter>
