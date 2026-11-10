<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { safeApi } from "$lib/utils/api";
  import {
    IconLoader2,
    IconMicrophone,
    IconPlayerStopFilled,
    IconSend,
    IconSlash,
  } from "@tabler/icons-svelte";
  import { onMount, tick } from "svelte";
  import AttachmentButton from "./AttachmentButton.svelte";
  import AttachmentMenu from "./AttachmentMenu.svelte";
  import ChatCommandMenu from "./ChatCommandMenu.svelte";
  import { chatCommands, filterCommands, type ChatCommand } from "./commands";

  let {
    value = $bindable(""),
    placeholder = "Enter 换行，Ctrl+Enter 发送",
    commands = chatCommands,
    onSend = () => {},
    onCommand = () => {},
    onRecord = () => {},
  }: {
    value?: string;
    placeholder?: string;
    commands?: ChatCommand[];
    /** 发送时回传当前已选择文件的完整路径数组 */
    onSend?: (files: string[]) => void;
    onCommand?: (cmd: ChatCommand) => void;
    onRecord?: () => void;
  } = $props();

  let textarea = $state<HTMLTextAreaElement>();
  let showCommands = $state(false);
  let selectedIndex = $state(0);
  let isComposing = $state(false);

  // 用户在发送动作后、本次 sending 转换为 false 的瞬间是否应被动恢复焦点。
  // 用户若在流式期间点击他处 → activeElement 不再是 body → 跳过恢复。
  let shouldRefocusAfterSend = $state(false);

  /** 仅维护文件完整路径队列，不持有文件对象 */
  let files = $state<string[]>([]);
  let showAttachments = $state(false);

  let filtered = $derived(showCommands ? filterCommands(value, commands) : []);
  let sending = $derived(messageStore.isLoading);
  let reloading = $derived(messageStore.isReloading);
  let aborting = $derived(messageStore.isAborting);
  let deleting = $derived(messageStore.isDeleting);
  let disabled = $derived(sending || reloading || deleting);
  let canSend = $derived(value.trim().length > 0 && !disabled);

  let effectivePlaceholder = $derived(
    reloading ? "正在同步会话…" : deleting ? "正在删除消息…" : placeholder,
  );

  async function openFilePicker() {
    if (disabled) return;
    let picked: string[];
    picked = await safeApi().system.openFile({
      title: "选择附件文件",
      buttonLabel: "添加",
      multi: true,
    });
    if (!picked || picked.length === 0) return;
    mergeFiles(picked);
    showAttachments = true;
  }

  function mergeFiles(picked: string[]) {
    if (picked.length === 0) return;
    const next = [...files];
    for (const file of picked) {
      if (file && !next.includes(file)) next.push(file);
    }
    files = next;
  }

  function handleAttachClick() {
    if (disabled) return;
    showCommands = false;
    if (files.length === 0) {
      void openFilePicker();
    } else {
      showAttachments = !showAttachments;
    }
  }

  function removeFile(path: string) {
    files = files.filter((file) => file !== path);
    if (files.length === 0) showAttachments = false;
  }

  $effect(() => {
    if (disabled) {
      showCommands = false;
      showAttachments = false;
    }
  });

  function send() {
    if (!canSend) return;
    showCommands = false;
    showAttachments = false;
    shouldRefocusAfterSend = true;
    const outgoingFiles = files.slice();
    onSend(outgoingFiles);
    value = "";
    files = [];
    selectedIndex = 0;
    tick().then(adjustHeight);
  }

  async function stop() {
    await messageStore.abort();
  }

  // 显式 refocus 策略：
  // 当 sending 结束时，仅在以下条件齐备时恢复焦点到输入框：
  //   1. 用户本次发送动作触发过（shouldRefocusAfterSend === true）
  //   2. 当前焦点仍在 document.body（即焦点是被 disabled textarea 自动踢出，而非用户主动移走）
  $effect(() => {
    if (sending || !shouldRefocusAfterSend) return;
    shouldRefocusAfterSend = false;
    if (typeof document === "undefined") return;
    const active = document.activeElement;
    if (!active || active === document.body) {
      textarea?.focus();
    }
  });

  $effect(() => {
    void value;
    tick().then(adjustHeight);
  });

  onMount(() => {
    textarea?.focus();
  });

  function adjustHeight() {
    if (!textarea) return;
    textarea.style.height = "auto";
    if (!value.trim()) return;
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
  }

  function handleInput() {
    if (value.startsWith("/")) {
      showCommands = true;
      selectedIndex = 0;
    } else {
      showCommands = false;
    }
  }

  function selectCommand(cmd: ChatCommand) {
    value = cmd.label + " ";
    showCommands = false;
    onCommand(cmd);
    tick().then(() => {
      textarea?.focus();
      if (textarea)
        textarea.selectionStart = textarea.selectionEnd = value.length;
      adjustHeight();
    });
  }

  function openCommands() {
    if (disabled) return;
    showAttachments = false;
    value = "/";
    handleInput();
    tick().then(() => {
      textarea?.focus();
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = value.length;
      }
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (disabled) {
      event.preventDefault();
      return;
    }
    if (isComposing && event.key === "Enter") return;

    if (showCommands && filtered.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectedIndex = (selectedIndex + 1) % filtered.length;
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedIndex =
          selectedIndex === 0 ? filtered.length - 1 : selectedIndex - 1;
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey) {
        event.preventDefault();
        const cmd = filtered[selectedIndex];
        if (cmd) selectCommand(cmd);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        showCommands = false;
        return;
      }
    }

    // 与 placeholder 保持一致：Enter 换行，Ctrl+Enter 发送，Shift+Enter 也换行
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      send();
    }
  }
</script>

<div class="relative shrink-0 border-t border-border/50 bg-muted/20 p-3">
  {#if showCommands && filtered.length > 0 && !disabled}
    <ChatCommandMenu
      commands={filtered}
      {selectedIndex}
      onSelect={selectCommand}
    />
  {/if}

  {#if showAttachments && files.length > 0 && !disabled}
    <AttachmentMenu
      {files}
      onRemove={removeFile}
      onAdd={() => void openFilePicker()}
      onClose={() => (showAttachments = false)}
    />
  {/if}

  <div
    class="rounded-2xl border border-input bg-background/50 transition-all duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 {disabled
      ? 'opacity-60'
      : ''}"
  >
    <textarea
      bind:this={textarea}
      bind:value
      oninput={handleInput}
      onkeydown={handleKeydown}
      oncompositionstart={() => (isComposing = true)}
      oncompositionend={() => (isComposing = false)}
      placeholder={effectivePlaceholder}
      rows="1"
      {disabled}
      class="chat-textarea max-h-50 w-full resize-none overflow-y-auto bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
      aria-label="消息输入框"></textarea>

    <div
      class="flex items-center justify-between border-t border-border/50 px-2 py-1.5"
    >
      <div class="flex items-center gap-0.5">
        <AttachmentButton
          count={files.length}
          open={showAttachments}
          {disabled}
          onTrigger={handleAttachClick}
        />
        <button
          type="button"
          onclick={() => !disabled && onRecord()}
          {disabled}
          title="语音输入"
          aria-label="语音输入"
          class="group flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <IconMicrophone
            size={18}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        </button>
        <button
          type="button"
          onclick={openCommands}
          {disabled}
          title="命令"
          aria-label="打开命令菜单"
          class="group flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <IconSlash
            size={18}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        </button>
      </div>

      <Button
        size="sm"
        class="group size-9 shrink-0 rounded-xl p-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-95 disabled:hover:translate-y-0 disabled:active:scale-100"
        onclick={sending ? stop : send}
        disabled={sending ? aborting : !canSend}
        aria-label={aborting ? "终止中" : sending ? "停止生成" : "发送消息"}
        title={aborting ? "终止中…" : sending ? "停止生成" : "发送"}
      >
        {#if aborting}
          <IconLoader2
            size={18}
            stroke={1.5}
            class="animate-spin transition-transform duration-200 group-active:scale-110"
          />
        {:else if sending}
          <IconPlayerStopFilled
            size={16}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        {:else}
          <IconSend
            size={18}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        {/if}
      </Button>
    </div>
  </div>
</div>

<style>
  .chat-textarea {
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent;
  }
  .chat-textarea::-webkit-scrollbar {
    width: 6px;
  }
  .chat-textarea::-webkit-scrollbar-track {
    background: transparent;
  }
  .chat-textarea::-webkit-scrollbar-thumb {
    background-color: hsl(var(--muted-foreground) / 0.3);
    border-radius: 12px;
  }
</style>
