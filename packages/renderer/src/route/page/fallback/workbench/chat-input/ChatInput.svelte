<!-- packages/renderer/src/route/page/fallback/workbench/chat-input/ChatInput.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    commandsStore,
    filterCommands,
    type ChatCommand,
  } from "$lib/store/local/commands.store.svelte";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { safeApi } from "$lib/utils/api";
  import {
    IconLoader2,
    IconPlayerStopFilled,
    IconSend,
  } from "@tabler/icons-svelte";
  import { onMount, tick } from "svelte";
  import AttachmentMenu from "./AttachmentMenu.svelte";
  import ChatCommandMenu from "./ChatCommandMenu.svelte";
  import ChatInputToolbar from "./ChatInputToolbar.svelte";
  import PickerMenu from "./PickerMenu.svelte";

  type OpenMenu = null | "attachments" | "tools" | "skills";

  let {
    value = $bindable(""),
    placeholder = "Enter 换行，Ctrl+Enter 发送",
    onSend = (_files: string[]) => {},
    onCommand = () => {},
    onRecord = () => {},
  }: {
    value?: string;
    placeholder?: string;
    /**
     * 发送时回传已选附件完整路径。
     * tools/skills 的唯一真源是 messageStore.selectedTools/selectedSkills，
     * 由 messageStore 内部在 AIResponse 启动时直接读取，不再经由此回调透传。
     */
    onSend?: (files: string[]) => void;
    onCommand?: (cmd: ChatCommand) => void;
    onRecord?: () => void;
  } = $props();

  let textarea = $state<HTMLTextAreaElement>();
  let showCommands = $state(false);
  let selectedIndex = $state(0);
  let isComposing = $state(false);

  // 三菜单互斥：同一时刻最多展开一个（附件 / 工具 / 技能）
  let openMenu = $state<OpenMenu>(null);

  // 用户在发送动作后、本次 sending 转换为 false 的瞬间是否应被动恢复焦点
  let shouldRefocusAfterSend = $state(false);

  /** 仅维护文件完整路径队列，不持有文件对象 */
  let files = $state<string[]>([]);

  let commands = $derived(commandsStore.commands);
  let hasCommands = $derived(commands.length > 0);
  let filtered = $derived(showCommands ? filterCommands(value, commands) : []);
  let sending = $derived(messageStore.isLoading);
  let reloading = $derived(messageStore.isReloading);
  let aborting = $derived(messageStore.isAborting);
  let deleting = $derived(messageStore.isDeleting);
  let disabled = $derived(sending || reloading || deleting);
  let slashDisabled = $derived(disabled || !hasCommands);
  let slashTitle = $derived(!hasCommands ? "当前项目类型未提供命令" : "命令");
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
    openMenu = "attachments";
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
      openMenu = null;
      void openFilePicker();
    } else {
      openMenu = openMenu === "attachments" ? null : "attachments";
    }
  }

  function toggleMenu(menu: Exclude<OpenMenu, null>) {
    if (disabled) return;
    showCommands = false;
    openMenu = openMenu === menu ? null : menu;
  }

  function closeMenu() {
    openMenu = null;
  }

  function removeFile(path: string) {
    files = files.filter((file) => file !== path);
    if (files.length === 0 && openMenu === "attachments") openMenu = null;
  }

  function clearFiles() {
    files = [];
    openMenu = null;
  }

  $effect(() => {
    if (disabled) {
      showCommands = false;
      openMenu = null;
    }
  });

  function send() {
    if (!canSend) return;
    showCommands = false;
    openMenu = null;
    shouldRefocusAfterSend = true;
    const outgoingFiles = files.slice();
    onSend(outgoingFiles);
    value = "";
    files = [];
    // 工具/技能选择保持原样，不自动清空（由用户/业务显式清理）。
    selectedIndex = 0;
    tick().then(adjustHeight);
  }

  async function stop() {
    await messageStore.abort();
  }

  // 显式 refocus 策略（保持原逻辑）
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
      openMenu = null;
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
    if (disabled || !hasCommands) return;
    openMenu = null;
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

    if (showCommands) {
      if (filtered.length > 0) {
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
      }
      if (event.key === "Escape") {
        event.preventDefault();
        showCommands = false;
        return;
      }
    }

    // Enter 换行，Ctrl+Enter 发送
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      send();
    }
  }
</script>

<div class="relative shrink-0 border-t border-border/50 bg-muted/20 p-3">
  {#if showCommands && !disabled}
    {#if filtered.length > 0}
      <ChatCommandMenu
        commands={filtered}
        {selectedIndex}
        onSelect={selectCommand}
      />
    {:else}
      <div
        class="absolute bottom-full left-0 right-0 z-20 mb-2 rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-muted-foreground shadow-lg"
        role="note"
      >
        当前项目未提供命令。以
        <span class="font-mono text-foreground">/</span>
        开头的内容会被解释为命令，如不确定请勿以
        <span class="font-mono text-foreground">/</span>
        开头。
      </div>
    {/if}
  {/if}

  {#if openMenu === "attachments" && files.length > 0 && !disabled}
    <AttachmentMenu
      {files}
      onRemove={removeFile}
      onAdd={() => void openFilePicker()}
      onClearAll={clearFiles}
      onClose={closeMenu}
    />
  {/if}

  {#if openMenu === "tools" && !disabled}
    <PickerMenu
      kind="tools"
      bind:selectedItems={messageStore.selectedTools}
      builtinItems={messageStore.builtinTools}
      onClose={closeMenu}
    />
  {/if}

  {#if openMenu === "skills" && !disabled}
    <PickerMenu
      kind="skills"
      bind:selectedItems={messageStore.selectedSkills}
      emptyLabel="没有匹配的技能，试试调整筛选词"
      onClose={closeMenu}
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
      <ChatInputToolbar
        filesCount={files.length}
        toolsCount={messageStore.selectedTools.length}
        skillsCount={messageStore.selectedSkills.length}
        {openMenu}
        {disabled}
        commandsDisabled={slashDisabled}
        commandsTitle={slashTitle}
        onAttachClick={handleAttachClick}
        onToolsClick={() => toggleMenu("tools")}
        onSkillsClick={() => toggleMenu("skills")}
        onRecordClick={() => !disabled && onRecord()}
        onCommandsClick={openCommands}
      />

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
