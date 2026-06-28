<!--
  ╭─────────────────────────────────────────────────────╮
  │ [对话框内容组件 → ScriptEditorDialog.svelte]          │
  │ 职责：输入剧本文本的极简对话框                         │
  │ 契约：onClose(string) 返回剧本文本 / onCancel() 取消  │
  ╰─────────────────────────────────────────────────────╯
-->
<script lang="ts">
  import {
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import {
    IconDeviceFloppy,
    IconX,
    IconAlertTriangle,
  } from "@tabler/icons-svelte";
  import type { DialogComponentProps } from "$lib/types/dialog";

  type Props = {
    title?: string;
    description?: string;
    placeholder?: string;
    initialText?: string;
  } & DialogComponentProps<string>;

  let {
    title = "新建剧本",
    description = "在下方粘贴自然语言剧本内容(不限字数)。",
    placeholder = "在此输入剧本正文内容。人物、简介、制作要求等请在「要求」中设置。……",
    initialText = "",
    onClose,
    onCancel,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(initialText);
  const isValid = $derived(text.trim().length > 0);
  const isEditing = $derived(initialText.length > 0);

  function handleSave() {
    if (!isValid) return;
    onClose(text.trim());
  }
</script>

<DialogHeader>
  <DialogTitle>{title}</DialogTitle>
  {#if isEditing}
    <div
      class="flex items-start gap-2.5 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3"
    >
      <IconAlertTriangle
        size={18}
        stroke={1.5}
        class="mt-0.5 shrink-0 text-destructive"
      />
      <p class="text-sm font-medium leading-relaxed text-destructive">
        剧本变动，需要重新计算，相当于新建项目，非必要不改动剧本。
      </p>
    </div>
  {:else}
    <DialogDescription>{description}</DialogDescription>
  {/if}
</DialogHeader>

<div class="py-4">
  <Textarea
    bind:value={text}
    {placeholder}
    rows={30}
    class="min-h-48 resize-y rounded-xl border-border/50 bg-background"
  />
</div>

<DialogFooter class="mt-4">
  <Button variant="outline" class="rounded-xl" onclick={() => onCancel()}>
    <IconX class="size-4" />
    取消
  </Button>
  <Button class="rounded-xl" onclick={handleSave} disabled={!isValid}>
    <IconDeviceFloppy class="size-4" />
    保存
  </Button>
</DialogFooter>
