<!-- src/lib/components/chat/ChatInput.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import { IconSend } from "@tabler/icons-svelte";

  let {
    value = $bindable(""),
    placeholder = "输入消息... (Enter 发送，Shift+Enter 换行)",
    disabled = false,
    hint = "AI 可能会出错，请仔细核对重要信息",
    onSend = () => {},
  }: {
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    hint?: string;
    onSend?: () => void;
  } = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  let canSend = $derived(value.trim().length > 0 && !disabled);
</script>

<Separator />

<div class="border-t border-border/50 p-6">
  <div class="flex items-end gap-3">
    <textarea
      bind:value
      onkeydown={handleKeydown}
      {placeholder}
      {disabled}
      class="min-h-[80px] max-h-[200px] flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200"
    ></textarea>

    <Button
      size="sm"
      class="size-10 shrink-0 rounded-xl p-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
      onclick={onSend}
      disabled={!canSend}
    >
      <IconSend size={18} stroke={1.5} />
    </Button>
  </div>

  <p class="mt-3 text-xs text-muted-foreground">
    {hint}
  </p>
</div>

<style>
  textarea {
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent;
  }

  textarea::-webkit-scrollbar {
    width: 6px;
  }

  textarea::-webkit-scrollbar-track {
    background: transparent;
  }

  textarea::-webkit-scrollbar-thumb {
    background-color: hsl(var(--muted-foreground) / 0.3);
    border-radius: 12px;
  }
</style>
