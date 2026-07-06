<!--
  ╭─────────────────────────────────────────────────────╮
  │ [对话框内容组件 → PromptDialog.svelte]                │
  │ 职责：通用单行/多行字符串输入对话框（取代 prompt）      │
  │ 契约：onClose(string) 返回输入值 / onCancel() 取消    │
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
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import { IconCheck, IconX } from "@tabler/icons-svelte";

  type Props = {
    /** 对话框标题 */
    title?: string;
    /** 补充说明文字 */
    description?: string;
    /** 输入框上方的字段标签 */
    label?: string;
    /** 占位提示 */
    placeholder?: string;
    /** 初始值 */
    initialValue?: string;
    /** 确认按钮文字 */
    confirmText?: string;
    /** 取消按钮文字 */
    cancelText?: string;
    /** 是否使用多行文本域 */
    multiline?: boolean;
    /** 多行模式的行数 */
    rows?: number;
    /** 是否必填（为空时禁用确认） */
    required?: boolean;
    /** 最大字符数（0 表示不限制） */
    maxLength?: number;
  } & DialogComponentProps<string>;

  let {
    title = "请输入",
    description = "",
    label = "",
    placeholder = "请输入内容…",
    initialValue = "",
    confirmText = "确认",
    cancelText = "取消",
    multiline = false,
    rows = 6,
    required = false,
    maxLength = 0,
    onClose,
    onCancel,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let value = $state(initialValue);

  const trimmed = $derived(value.trim());
  const isValid = $derived(!required || trimmed.length > 0);
  const charCount = $derived(value.length);
  const overLimit = $derived(maxLength > 0 && charCount > maxLength);
  const canConfirm = $derived(isValid && !overLimit);

  const inputId = "prompt-dialog-field";

  function handleConfirm() {
    if (!canConfirm) return;
    onClose(value.trim());
  }

  // 单行模式下按 Enter 直接确认
  function handleKeydown(e: KeyboardEvent) {
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    }
  }
</script>

<DialogHeader>
  <DialogTitle>{title}</DialogTitle>
  {#if description}
    <DialogDescription>{description}</DialogDescription>
  {/if}
</DialogHeader>

<div class="space-y-2 py-4">
  {#if label}
    <Label for={inputId} class="text-sm font-medium">
      {label}
      {#if required}
        <span class="text-destructive">*</span>
      {/if}
    </Label>
  {/if}

  {#if multiline}
    <Textarea
      id={inputId}
      bind:value
      {placeholder}
      {rows}
      class="min-h-32 resize-y rounded-xl border-border/50 bg-background"
    />
  {:else}
    <Input
      id={inputId}
      bind:value
      {placeholder}
      onkeydown={handleKeydown}
      class="rounded-xl border-border/50 bg-background"
    />
  {/if}

  {#if maxLength > 0}
    <div class="flex justify-end">
      <span
        class="text-xs"
        class:text-muted-foreground={!overLimit}
        class:text-destructive={overLimit}
      >
        {charCount} / {maxLength}
      </span>
    </div>
  {/if}
</div>

<DialogFooter class="mt-4">
  <Button variant="outline" class="rounded-xl" onclick={() => onCancel()}>
    <IconX class="size-4" />
    {cancelText}
  </Button>
  <Button class="rounded-xl" onclick={handleConfirm} disabled={!canConfirm}>
    <IconCheck class="size-4" />
    {confirmText}
  </Button>
</DialogFooter>