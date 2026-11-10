<!-- 用户消息气泡 · 右对齐 · 操作内联到 header（无右键菜单） -->
<script lang="ts">
  import PromptDialog from "$lib/components/dialog/Prompt.svelte";
  import MarkdownView from "$lib/components/markdown/Message.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Chat from "$lib/components/ui/chat";
  import type { ChatMessage } from "$lib/store/local/chat.types";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { dialogStore } from "$lib/store/ui/dialog.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconCopy,
    IconLoader2,
    IconPencil,
    IconRefresh,
    IconTrash,
    IconUser,
  } from "@tabler/icons-svelte";
  import { confirmDeleteMessage, confirmRerun } from "../confirm.svelte";
  import MessageAttachments from "./MessageAttachments.svelte";
  import MessageHeader from "./MessageHeader.svelte";

  let { message }: { message: ChatMessage } = $props();

  let copied = $state(false);
  let collapsed = $derived(messageStore.collapsedMessages[message.id] === true);
  let deleting = $derived(messageStore.deletingMessages[message.id] === true);

  let files = $derived(message.files ?? []);

  function copy() {
    navigator.clipboard?.writeText(message.content);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function toggleCollapse() {
    messageStore.toggleMessage(message.id);
  }

  async function editMessage() {
    const newMessage = await dialogStore.safeShow(
      PromptDialog,
      {
        title: `编辑并重新执行`,
        label: "新的历史消息",
        placeholder: "请输入消息内容，如需更改附件，请删除并重新发送",
        initialValue: message.content,
        required: true,
      },
      { size: "xl6" },
    );

    if (typeof newMessage !== "string" || !newMessage.trim()) return;
    if (newMessage === message.content) return;

    await messageStore.resendFrom(message.id, newMessage);
  }

  async function resendFromHere() {
    const ok = await confirmRerun();
    if (!ok) return;
    await messageStore.resendFrom(message.id);
  }

  async function deleteMessage() {
    const ok = await confirmDeleteMessage();
    if (!ok) return;
    await messageStore.deleteMessage(message.id);
  }
</script>

<div class="group/msg flex min-w-0 flex-col gap-1.5" use:autoAnimate>
  <MessageHeader role="user">
    {#snippet identity()}
      <span class="text-xs font-medium text-muted-foreground">你</span>
      <Chat.BubbleAvatar class="size-6 shrink-0">
        <Chat.BubbleAvatarFallback class="bg-primary/10 text-primary">
          <IconUser size={15} stroke={1.5} />
        </Chat.BubbleAvatarFallback>
      </Chat.BubbleAvatar>
    {/snippet}

    {#snippet actions()}
      <!-- 复制 -->
      <Button
        variant="ghost"
        size="icon"
        onclick={copy}
        class="group size-6 rounded-lg text-muted-foreground opacity-0 transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80 group-hover/msg:opacity-100"
        aria-label="复制消息内容"
        title="复制消息内容"
      >
        {#if copied}
          <IconCheck
            size={14}
            stroke={1.5}
            class="text-primary transition-transform duration-200 group-active:scale-110"
          />
        {:else}
          <IconCopy
            size={14}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        {/if}
      </Button>

      <!-- 折叠 -->
      <Button
        variant="ghost"
        size="icon"
        onclick={toggleCollapse}
        class="group size-6 rounded-lg text-muted-foreground opacity-0 transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80 group-hover/msg:opacity-100"
        aria-label={collapsed ? "展开消息" : "折叠消息"}
        title={collapsed ? "展开消息" : "折叠消息"}
      >
        {#if collapsed}
          <IconChevronDown
            size={14}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        {:else}
          <IconChevronUp
            size={14}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        {/if}
      </Button>

      <!-- 修改 -->
      <Button
        variant="ghost"
        size="icon"
        onclick={editMessage}
        disabled={messageStore.isLoading || deleting}
        class="group size-6 rounded-lg text-muted-foreground opacity-0 transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80 group-hover/msg:opacity-100"
        aria-label="修改消息"
        title="修改消息"
      >
        <IconPencil
          size={14}
          stroke={1.5}
          class="transition-transform duration-200 group-active:scale-110"
        />
      </Button>

      <!-- 重新运行 -->
      <Button
        variant="ghost"
        size="icon"
        onclick={resendFromHere}
        disabled={messageStore.isLoading || deleting}
        class="group size-6 rounded-lg text-muted-foreground opacity-0 transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80 group-hover/msg:opacity-100"
        aria-label="重新运行"
        title="重新运行"
      >
        <IconRefresh
          size={14}
          stroke={1.5}
          class="transition-transform duration-200 group-active:scale-110"
        />
      </Button>

      <!-- 删除 -->
      <Button
        variant="ghost"
        size="icon"
        onclick={deleteMessage}
        disabled={messageStore.isLoading || deleting}
        class="group size-6 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive active:scale-90 active:bg-destructive/20 {deleting
          ? 'opacity-100'
          : 'opacity-0 group-hover/msg:opacity-100'}"
        aria-label={deleting ? "正在删除…" : "删除消息"}
        title={deleting ? "正在删除…" : "删除消息"}
      >
        {#if deleting}
          <IconLoader2 size={14} stroke={1.5} class="animate-spin" />
        {:else}
          <IconTrash
            size={14}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        {/if}
      </Button>
    {/snippet}
  </MessageHeader>

  {#if !collapsed}
    <div
      class="min-w-0 rounded-2xl border border-primary/15 bg-primary/8 p-3 text-sm leading-relaxed text-foreground wrap-break-word"
    >
      <MarkdownView {message} />
    </div>

    {#if files.length > 0}
      <MessageAttachments {files} />
    {/if}
  {:else}
    <button
      type="button"
      onclick={toggleCollapse}
      class="flex items-center gap-2 self-end rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground active:scale-95"
    >
      <IconChevronDown size={14} stroke={1.5} />
      <span>消息已折叠 · 点击展开</span>
    </button>
  {/if}
</div>
