<!-- packages/renderer/src/route/page/fallback/workbench/chat-input/ChatInput.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { configStore } from "$lib/store/config.svelte";
  import {
    commandsStore,
    filterCommands,
    type ChatCommand,
  } from "$lib/store/local/commands.store.svelte";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { safeApi } from "$lib/utils/api";
  import { eventToCombo, formatCombo } from "$lib/utils/commands/keycode";
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

  const SLASH = "/".charCodeAt(0);

  let {
    placeholder,
    onSend = () => {},
    onCommand = () => {},
    onRecord = () => {},
  }: {
    placeholder?: string;
    /**
     * 发送时回传文本内容与附件完整路径。
     * tools/skills 的唯一真源是 messageStore.selectedTools/selectedSkills，
     * 由 messageStore 内部在 AIResponse 启动时直接读取，不再经由此回调透传。
     */
    onSend?: (content: string, files: string[]) => void;
    onCommand?: (cmd: ChatCommand) => void;
    onRecord?: () => void;
  } = $props();

  let textarea = $state<HTMLTextAreaElement>();
  let showCommands = $state(false);
  let selectedIndex = $state(0);
  let isComposing = $state(false);
  let hasContent = $state(false);
  /** 命令过滤词：始终是首行，不是整段文本 */
  let commandQuery = $state("");

  // 三菜单互斥：同一时刻最多展开一个（附件 / 工具 / 技能）
  let openMenu = $state<OpenMenu>(null);

  // 用户在发送动作后、本次 sending 转换为 false 的瞬间是否应被动恢复焦点
  let shouldRefocusAfterSend = $state(false);

  /** 仅维护文件完整路径队列，不持有文件对象 */
  let files = $state<string[]>([]);

  let commands = $derived(commandsStore.commands);
  let hasCommands = $derived(commands.length > 0);
  let filtered = $derived(
    showCommands ? filterCommands(commandQuery, commands) : [],
  );
  let sending = $derived(messageStore.isLoading);
  let reloading = $derived(messageStore.isReloading);
  let aborting = $derived(messageStore.isAborting);
  let deleting = $derived(messageStore.isDeleting);
  let disabled = $derived(sending || reloading || deleting);
  let slashDisabled = $derived(disabled || !hasCommands);
  let slashTitle = $derived(!hasCommands ? "当前项目类型未提供命令" : "命令");
  let canSend = $derived(hasContent && !disabled);

  /**
   * 占位符派生：优先遵循调用方传入的 placeholder；
   * 否则根据 `chat.send` 热键自动生成。
   *
   * 因为读取 `configStore.keybinding.getHotkeyForCommand` 会访问其 $state，
   * 此 $derived 会随快捷键变更自动刷新。
   */
  let effectivePlaceholder = $derived.by(() => {
    if (reloading) return "正在同步会话…";
    if (deleting) return "正在删除消息…";
    if (placeholder) return placeholder;

    const hotkeyStr = configStore.keybinding.getHotkeyForCommand("chat.send");
    if (!hotkeyStr) return "Enter 换行（未配置发送热键）";

    const firstCombo = hotkeyStr.split(",")[0]?.trim();
    if (!firstCombo) return "Enter 换行（未配置发送热键）";

    // 单键 Enter：约定为"Enter 发送 + Shift+Enter 换行"（Shift+Enter 会走浏览器默认换行）
    if (firstCombo === "return") {
      return "Enter 发送，Shift+Enter 换行";
    }
    return `Enter 换行，${formatCombo(firstCombo)} 发送`;
  });

  /**
   * 从原生 textarea 同步出组件内部需要的少量状态。
   *
   * 性能约束：
   * - 组合（IME）期间不调用，只由 compositionend 触发一次；
   * - 命令只认首行，首字符不是 "/" 时立即返回，
   *   避免对超长正文做换行扫描或整段切片。
   */
  function syncInputState() {
    if (!textarea) {
      hasContent = false;
      commandQuery = "";
      showCommands = false;
      return;
    }

    const nextValue = textarea.value;
    hasContent = nextValue.trim().length > 0;

    if (nextValue.charCodeAt(0) !== SLASH) {
      commandQuery = "";
      showCommands = false;
      adjustHeight(hasContent);
      return;
    }

    const lineEnd = nextValue.indexOf("\n");
    commandQuery = lineEnd === -1 ? nextValue : nextValue.slice(0, lineEnd);
    showCommands = true;
    selectedIndex = 0;
    openMenu = null;
    adjustHeight(hasContent);
  }

  function handleInput() {
    // IME 组合期间只允许浏览器维护原生 textarea，
    // 不把未确认的拼音串同步进 Svelte 状态。
    if (isComposing) return;
    syncInputState();
  }

  function handleCompositionStart() {
    isComposing = true;
  }

  function handleCompositionEnd() {
    isComposing = false;
    syncInputState();
  }

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

  function resetInput() {
    if (textarea) {
      textarea.value = "";
      textarea.style.height = "auto";
    }
    hasContent = false;
    commandQuery = "";
    showCommands = false;
    selectedIndex = 0;
  }

  function send() {
    if (!textarea || !canSend) return;

    const content = textarea.value;
    if (!content.trim()) return;

    showCommands = false;
    openMenu = null;
    shouldRefocusAfterSend = true;

    const outgoingFiles = files.slice();
    onSend(content, outgoingFiles);

    files = [];
    // 工具/技能选择保持原样，不自动清空（由用户/业务显式清理）。
    resetInput();
  }

  async function stop() {
    await messageStore.abort();
  }

  $effect(() => {
    if (sending || !shouldRefocusAfterSend) return;
    shouldRefocusAfterSend = false;
    if (typeof document === "undefined") return;
    const active = document.activeElement;
    if (!active || active === document.body) {
      textarea?.focus();
    }
  });

  onMount(() => {
    textarea?.focus();
  });

  function adjustHeight(hasText = hasContent) {
    if (!textarea) return;
    textarea.style.height = "auto";
    if (!hasText) return;
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
  }

  function focusAtEnd() {
    tick().then(() => {
      textarea?.focus();
      if (!textarea) return;
      const end = textarea.value.length;
      textarea.selectionStart = textarea.selectionEnd = end;
      adjustHeight(true);
    });
  }

  function selectCommand(cmd: ChatCommand) {
    showCommands = false;
    commandQuery = "";

    if (cmd.id === "clear") {
      resetInput();
      onCommand(cmd);
      return;
    }

    if (!textarea) {
      onCommand(cmd);
      return;
    }

    textarea.value = cmd.label + " ";
    hasContent = true;
    onCommand(cmd);
    focusAtEnd();
  }

  function openCommands() {
    if (disabled || !hasCommands || !textarea) return;

    openMenu = null;
    textarea.value = "/";
    syncInputState();
    focusAtEnd();
  }

  /**
   * 判断当前键事件是否命中指定命令的快捷键。
   * - 录制中：直接跳过，避免用户在设置页改动时被聊天热键干扰；
   * - 通过 `findCommandByHotkey` 反查，保证与配置中心一致。
   */
  function isComboForCmd(event: KeyboardEvent, cmdId: string): boolean {
    if (configStore.keybinding.isRecording) return false;
    const combo = eventToCombo(event);
    if (!combo) return false;
    return configStore.keybinding.findCommandByHotkey(combo) === cmdId;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (disabled) {
      event.preventDefault();
      return;
    }
    // IME 组合中按 Enter 视为输入结束，不触发送
    if (isComposing && event.key === "Enter") return;

    // 命令菜单交互优先
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

    // local 热键：发送消息（由 configStore.keybinding 决定，默认 ctrl+return）。
    // 绑定单键 return 时，Shift+Enter 的 combo 为 shift+return，不命中，走浏览器默认换行。
    if (isComboForCmd(event, "chat.send")) {
      event.preventDefault();
      send();
      return;
    }
    // 其余按键保持浏览器默认（Enter 换行）
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
      onChange={(items) => messageStore.persistSelected("tools", items)}
    />
  {/if}

  {#if openMenu === "skills" && !disabled}
    <PickerMenu
      kind="skills"
      bind:selectedItems={messageStore.selectedSkills}
      emptyLabel="没有匹配的技能，试试调整筛选词"
      onClose={closeMenu}
      onChange={(items) => messageStore.persistSelected("skills", items)}
    />
  {/if}

  <div
    class="rounded-2xl border border-input bg-background/50 transition-all duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 {disabled
      ? 'opacity-60'
      : ''}"
  >
    <textarea
      bind:this={textarea}
      oninput={handleInput}
      onkeydown={handleKeydown}
      oncompositionstart={handleCompositionStart}
      oncompositionend={handleCompositionEnd}
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
