<script lang="ts">
  import {
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import type { DialogComponentProps } from "$lib/types/dialog";

  type Props = {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive";
  } & DialogComponentProps<boolean>;

  let {
    title = "确认",
    message,
    confirmText = "确认",
    cancelText = "取消",
    variant = "default",
    onClose,
    onCancel,
  }: Props = $props();
</script>

<DialogHeader>
  <DialogTitle>{title}</DialogTitle>
  <DialogDescription>
    {#if message.startsWith("<") && message.endsWith(">")}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html message}
    {:else}
      {message}
    {/if}
  </DialogDescription>
</DialogHeader>

<DialogFooter class="mt-4">
  <Button variant="outline" onclick={() => onCancel()}>
    {cancelText}
  </Button>
  <Button {variant} onclick={() => onClose(true)}>
    {confirmText}
  </Button>
</DialogFooter>
