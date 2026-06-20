<script lang="ts">
  import { commandCenter } from "$lib/utils/commands/center";
  import { configStore } from "$lib/store/config.svelte"; // ← 全局 configStore，含 .keybinding (KeybindConfig 实例，内部已 $state)
  import type { CommandDescriptor } from "$lib/utils/commands/type";
  import autoAnimate from "@formkit/auto-animate";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";
  import * as Tabs from "$lib/components/ui/tabs";
  import {
    IconKeyboard,
    IconSearch,
    IconX,
    IconPlus,
    IconAlertTriangle,
    IconTrash,
    IconCommand,
    IconCheck,
    IconMinus,
    IconFolder,
  } from "@tabler/icons-svelte";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";

  // ── Types ──────────────────────────────────────────────────
  type CommandInfo = Omit<CommandDescriptor, "handler">;

  // ── Platform ───────────────────────────────────────────────
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  // ── Initialize Commands (one-shot, non-reactive) ──────────
  // commandCenter 不是响应式的，仅在组件初始化时读取一次。
  const allCommands: CommandInfo[] = commandCenter.getAllDescriptors();

  const categories: string[] = (() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const cats = new Set<string>();
    for (const cmd of allCommands) {
      if (cmd.category) cats.add(cmd.category);
    }
    return ["全部", ...Array.from(cats).sort()];
  })();

  // ── Reactive Bridge to KeybindConfig ──────────────────────
  // KeybindConfig.keybindings 内部已用 $state 声明，可直接 $derived 读取，
  // 任何对 configStore.keybinding 的增删（含外部 onKeybindingUpdate）都会自动刷新 UI。
  let bindings = $derived(configStore.keybinding.keybindings ?? {});

  // ── Reactive UI State ─────────────────────────────────────
  let searchQuery = $state("");
  let activeCategory = $state("全部");

  let recordingCommandId = $state<string | null>(null);
  let pendingCombo = $state<string | null>(null);
  let conflictCommandId = $state<string | null>(null);

  // ── Derived State ─────────────────────────────────────────
  let filteredCommands = $derived.by(() => {
    let cmds = allCommands;
    if (activeCategory !== "全部") {
      cmds = cmds.filter((c) => c.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      cmds = cmds.filter((c) => {
        const haystack =
          `${c.id} ${c.label} ${c.description ?? ""} ${c.category ?? ""}`.toLowerCase();
        return haystack.includes(q);
      });
    }
    return cmds;
  });

  let groupedCommands = $derived.by(() => {
    const groups: Record<string, CommandInfo[]> = {};
    for (const cmd of filteredCommands) {
      const cat = cmd.category || "未分类";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cmd);
    }
    return groups;
  });

  let stats = $derived.by(() => {
    const boundCount = Object.keys(bindings).filter(
      (id) => (bindings[id]?.length ?? 0) > 0,
    ).length;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const comboToCmds = new Map<string, string[]>();
    for (const [cmdId, combos] of Object.entries(bindings)) {
      for (const combo of combos) {
        const arr = comboToCmds.get(combo) ?? [];
        arr.push(cmdId);
        comboToCmds.set(combo, arr);
      }
    }
    const conflictCount = [...comboToCmds.values()].filter(
      (ids) => ids.length > 1,
    ).length;
    return {
      total: allCommands.length,
      bound: boundCount,
      unbound: allCommands.length - boundCount,
      conflicts: conflictCount,
    };
  });

  // ── Key Helpers ───────────────────────────────────────────
  function normalizeKey(key: string): string {
    const map: Record<string, string> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Enter: "return",
      " ": "space",
      Backspace: "backspace",
      Delete: "delete",
      Tab: "tab",
      Home: "home",
      End: "end",
      PageUp: "pageup",
      PageDown: "pagedown",
      "+": "plus",
      Insert: "insert",
      CapsLock: "capslock",
    };
    return map[key] ?? key.toLowerCase();
  }

  function formatKeyForDisplay(key: string): string {
    if (isMac) {
      const m: Record<string, string> = {
        ctrl: "⌃",
        command: "⌘",
        alt: "⌥",
        shift: "⇧",
        return: "↩",
        backspace: "⌫",
        delete: "⌦",
        escape: "Esc",
        tab: "⇥",
        space: "␣",
        up: "↑",
        down: "↓",
        left: "←",
        right: "→",
        plus: "+",
        capslock: "⇪",
      };
      return m[key] ?? key.toUpperCase();
    }
    const m: Record<string, string> = {
      ctrl: "Ctrl",
      command: "Cmd",
      alt: "Alt",
      shift: "Shift",
      return: "Enter",
      backspace: "⌫",
      delete: "Del",
      escape: "Esc",
      tab: "Tab",
      space: "Space",
      up: "↑",
      down: "↓",
      left: "←",
      right: "→",
      plus: "+",
      capslock: "Caps",
    };
    return m[key] ?? key.toUpperCase();
  }

  function parseComboForDisplay(combo: string): string[] {
    return combo.split("+").map(formatKeyForDisplay);
  }

  function getCommandLabel(cmdId: string): string {
    return allCommands.find((c) => c.id === cmdId)?.label ?? cmdId;
  }

  // ── Binding Actions (全部委托给 configStore.keybinding) ───
  function addBinding(cmdId: string, combo: string) {
    configStore.keybinding.addBinding(cmdId, combo);
  }

  function removeBinding(cmdId: string, combo: string) {
    configStore.keybinding.removeBinding(cmdId, combo);
  }

  async function clearAllBindings() {
    const confirmed = await confirmStore.request({
      title: "清空全部快捷键？",
      message: "此操作将删除所有命令的键盘快捷方式，且无法撤销。",
      destructive: true,
      variant: "question",
    });
    if (!confirmed) return;
    configStore.keybinding.clearBindings();
  }

  // ── Recording ─────────────────────────────────────────────
  function startRecording(cmdId: string) {
    recordingCommandId = cmdId;
    pendingCombo = null;
    conflictCommandId = null;
    if (typeof document !== "undefined")
      (document.activeElement as HTMLElement)?.blur?.();
  }

  function stopRecording() {
    recordingCommandId = null;
    pendingCombo = null;
    conflictCommandId = null;
  }

  function confirmOverride() {
    if (!pendingCombo || !recordingCommandId || !conflictCommandId) return;
    removeBinding(conflictCommandId, pendingCombo);
    addBinding(recordingCommandId, pendingCombo);
    stopRecording();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!recordingCommandId) return;

    event.preventDefault();
    event.stopPropagation();

    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;

    if (
      event.key === "Escape" &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      stopRecording();
      return;
    }

    const parts: string[] = [];
    if (event.ctrlKey) parts.push("ctrl");
    if (event.metaKey) parts.push("command");
    if (event.shiftKey) parts.push("shift");
    if (event.altKey) parts.push("alt");

    const key = normalizeKey(event.key);
    parts.push(key);
    const combo = parts.join("+");

    const hasModifier =
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    const isFKey = /^f\d+$/i.test(event.key);
    if (!hasModifier && !isFKey) return;

    // 通过 configStore 查找冲突命令
    const existingCmdId = configStore.keybinding.findCommandByHotkey(combo);
    if (existingCmdId && existingCmdId !== recordingCommandId) {
      conflictCommandId = existingCmdId;
      pendingCombo = combo;
      return;
    }
    if (existingCmdId === recordingCommandId) {
      stopRecording();
      return;
    }

    addBinding(recordingCommandId, combo);
    stopRecording();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- ════════════════════ SNIPPETS ════════════════════ -->

{#snippet keycap(label: string)}
  <kbd
    class="inline-flex items-center justify-center rounded-lg border border-border/50 bg-muted
           px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm
           min-w-6.5 h-6 select-none font-mono"
  >
    {label}
  </kbd>
{/snippet}

{#snippet statCard(
  Icon: typeof IconCommand,
  value: number,
  label: string,
  bgClass: string,
  fgClass: string,
)}
  <div
    class="rounded-2xl border border-border/50 bg-card p-6 shadow-sm
           transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
  >
    <div class="flex items-center gap-3">
      <div
        class={["flex items-center justify-center size-10 rounded-xl", bgClass]}
      >
        <Icon size={20} stroke={1.5} class={fgClass} />
      </div>
      <div>
        <p class="text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        <p class="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  </div>
{/snippet}

{#snippet emptyState(title: string, hint: string)}
  <div
    class="flex flex-col items-center justify-center py-20 text-center space-y-4 animate-fade-in"
  >
    <div class="flex items-center justify-center size-16 rounded-2xl bg-muted">
      <IconSearch size={24} stroke={1.5} class="text-muted-foreground" />
    </div>
    <div class="space-y-1">
      <p class="text-sm font-medium text-foreground">{title}</p>
      <p class="text-xs text-muted-foreground">{hint}</p>
    </div>
  </div>
{/snippet}

<!-- ════════════════════ MAIN LAYOUT ════════════════════ -->

<div class="w-full h-full overflow-auto bg-background">
  <div class="p-8 lg:p-12 space-y-8">
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → HotkeyManagerHeader.svelte]          │ -->
    <!-- │ 职责：页面标题、搜索栏与全局清空按钮                   │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <header class="space-y-6">
      <div class="flex items-start justify-between gap-6 flex-wrap">
        <div class="flex items-center gap-4">
          <div
            class="flex items-center justify-center size-12 rounded-2xl bg-primary/10 shrink-0"
          >
            <IconKeyboard size={24} stroke={1.5} class="text-primary" />
          </div>
          <div class="space-y-1">
            <h1 class="text-2xl font-semibold tracking-tight text-foreground">
              快捷键管理
            </h1>
            <p class="text-sm text-muted-foreground">
              自定义应用程序的键盘快捷方式，提升工作效率
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          class="rounded-xl shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          onclick={clearAllBindings}
          disabled={allCommands.length === 0 || stats.bound === 0}
        >
          <IconTrash size={16} stroke={1.5} class="mr-2" />
          清空全部
        </Button>
      </div>

      <div class="relative max-w-md">
        <IconSearch
          size={20}
          stroke={1.5}
          class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <Input
          bind:value={searchQuery}
          placeholder="搜索命令名称、描述或 ID..."
          class="pl-10 rounded-xl"
          disabled={allCommands.length === 0}
        />
        {#if searchQuery}
          <button
            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground
                   hover:text-foreground transition-all duration-200"
            onclick={() => {
              searchQuery = "";
            }}
          >
            <IconX size={16} stroke={1.5} />
          </button>
        {/if}
      </div>
    </header>
    <!-- ╭─── / HotkeyManagerHeader ───╮ -->

    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → HotkeyStatsRow.svelte]               │ -->
    <!-- │ 职责：显示绑定统计概览的四张指标卡片                   │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
      {@render statCard(
        IconCommand,
        stats.total,
        "全部命令",
        "bg-primary/10",
        "text-primary",
      )}
      {@render statCard(
        IconCheck,
        stats.bound,
        "已绑定",
        "bg-primary/10",
        "text-primary",
      )}
      {@render statCard(
        IconMinus,
        stats.unbound,
        "未绑定",
        "bg-muted",
        "text-muted-foreground",
      )}
      {@render statCard(
        IconAlertTriangle,
        stats.conflicts,
        "冲突",
        stats.conflicts > 0 ? "bg-destructive/10" : "bg-muted",
        stats.conflicts > 0 ? "text-destructive" : "text-muted-foreground",
      )}
    </div>
    <!-- ╭─── / HotkeyStatsRow ───╮ -->

    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → HotkeyCommandList.svelte]            │ -->
    <!-- │ 职责：分类标签页与命令行列表，含快捷键绑定/录制操作    │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <div
      class="rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-200"
    >
      {#if allCommands.length === 0}
        <div class="p-8">
          {@render emptyState(
            "暂无可用命令",
            "当前命令中心尚未注册任何命令，请先注册命令后再来配置快捷键",
          )}
        </div>
      {:else}
        <!-- Category Tabs -->
        <div class="px-6 pt-6">
          <Tabs.Root bind:value={activeCategory}>
            <Tabs.List class="w-full justify-start flex-wrap h-auto gap-1">
              {#each categories as cat (cat)}
                <Tabs.Trigger value={cat} class="rounded-xl">{cat}</Tabs.Trigger
                >
              {/each}
            </Tabs.List>
          </Tabs.Root>
        </div>

        <Separator class="mt-4" />

        <!-- Command Groups -->
        <div class="p-6 space-y-8" use:autoAnimate>
          {#if Object.keys(groupedCommands).length === 0}
            {@render emptyState(
              "未找到匹配的命令",
              "尝试使用不同的搜索关键词或切换分类",
            )}
          {:else}
            {#each Object.entries(groupedCommands) as [category, commands] (category)}
              <section class="space-y-3 animate-fade-in">
                <!-- Category Header -->
                <div class="flex items-center gap-2 px-1">
                  <IconFolder
                    size={16}
                    stroke={1.5}
                    class="text-muted-foreground"
                  />
                  <h3
                    class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    {category}
                  </h3>
                  <Badge
                    variant="secondary"
                    class="rounded-lg text-[10px] h-5 px-1.5"
                  >
                    {commands.length}
                  </Badge>
                </div>

                <!-- Command Rows -->
                <div
                  class="rounded-xl border border-border/50 divide-y divide-border/30 overflow-hidden"
                  use:autoAnimate
                >
                  {#each commands as command (command.id)}
                    <!--╭─────────────────────────────────────────────────────╮ -->
                    <!-- │ [可抽取子组件 → HotkeyCommandRow.svelte]             │ -->
                    <!-- │ 职责：单条命令行，含标签、描述、快捷键展示与录制      │ -->
                    <!-- ╰─────────────────────────────────────────────────────╯ -->
                    <div
                      class={[
                        "flex items-center justify-between px-4 py-3.5 transition-all duration-200 gap-4",
                        recordingCommandId === command.id
                          ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                          : "hover:bg-muted/40",
                      ]}
                    >
                      <!-- Left: Command Info -->
                      <div class="flex-1 min-w-0 space-y-0.5">
                        <p class="text-sm font-medium text-foreground">
                          {command.label}
                        </p>
                        {#if command.description}
                          <p class="text-xs text-muted-foreground truncate">
                            {command.description}
                          </p>
                        {/if}
                      </div>

                      <!-- Right: Hotkey Badges & Actions -->
                      <div class="flex items-center gap-3 shrink-0">
                        {#if recordingCommandId === command.id}
                          <!-- Recording indicator (inline) -->
                          <div class="flex items-center gap-2 animate-fade-in">
                            <div
                              class="flex items-center gap-2 rounded-xl border border-primary/20
                                     bg-primary/5 px-3 py-1.5"
                            >
                              <div
                                class="size-2 rounded-full bg-primary animate-pulse"
                              ></div>
                              <span class="text-xs font-medium text-primary">
                                录制中...
                              </span>
                            </div>
                          </div>
                        {:else}
                          <!-- Normal: Hotkey badges -->
                          {#if bindings[command.id]?.length}
                            <div
                              class="flex items-center gap-2 flex-wrap"
                              use:autoAnimate
                            >
                              {#each bindings[command.id] as combo (combo)}
                                {@const keys = parseComboForDisplay(combo)}
                                <div
                                  class="group flex items-center gap-1 rounded-xl
                                         bg-muted/60 pl-1.5 pr-1 py-0.5
                                         transition-all duration-200 hover:bg-muted"
                                >
                                  <div class="flex items-center gap-0.5">
                                    {#each keys as keyLabel, ki (ki + "-" + keyLabel)}
                                      {@render keycap(keyLabel)}
                                    {/each}
                                  </div>
                                  <button
                                    class="flex items-center justify-center size-5 rounded-lg
                                           text-muted-foreground opacity-0 group-hover:opacity-100
                                           hover:text-destructive hover:bg-destructive/10
                                           transition-all duration-200"
                                    onclick={() =>
                                      removeBinding(command.id, combo)}
                                    title="移除此快捷键"
                                  >
                                    <IconX size={12} stroke={2} />
                                  </button>
                                </div>
                              {/each}
                            </div>
                          {:else}
                            <span
                              class="text-xs text-muted-foreground/60 italic"
                            >
                              未设置
                            </span>
                          {/if}

                          <Button
                            variant="ghost"
                            size="sm"
                            class="rounded-xl size-8 p-0 text-muted-foreground
                                   hover:text-primary transition-all duration-200"
                            onclick={() => startRecording(command.id)}
                            title="添加快捷键"
                          >
                            <IconPlus size={16} stroke={1.5} />
                          </Button>
                        {/if}
                      </div>
                    </div>
                    <!-- ╭─── / HotkeyCommandRow ───╮ -->
                  {/each}
                </div>
              </section>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
    <!-- ╭─── / HotkeyCommandList ───╮ -->
  </div>
  <!-- ════════ Recording Floating Bar ════════ -->
  {#if recordingCommandId}
    <div
      class="fixed bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none px-6
             animate-slide-up"
    >
      {#if conflictCommandId && pendingCombo}
        {@const conflictKeys = parseComboForDisplay(pendingCombo)}
        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → HotkeyConflictBar.svelte]            │ -->
        <!-- │ 职责：快捷键冲突时的底部浮层，含覆盖/取消操作         │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <div
          class="rounded-2xl border border-destructive/20 bg-card/95 backdrop-blur-xl
                 shadow-xl pointer-events-auto animate-fade-in max-w-xl w-full"
        >
          <div class="px-6 py-4 space-y-3">
            <div class="flex items-center gap-3">
              <div
                class="flex items-center justify-center size-8 rounded-xl bg-destructive/10 shrink-0"
              >
                <IconAlertTriangle
                  size={16}
                  stroke={1.5}
                  class="text-destructive"
                />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-medium text-foreground">快捷键冲突</p>
                <p class="text-xs text-muted-foreground truncate">
                  该组合键已被「{getCommandLabel(conflictCommandId)}」使用
                </p>
              </div>
            </div>
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-1">
                {#each conflictKeys as keyLabel, i (i + "-" + keyLabel)}
                  {@render keycap(keyLabel)}
                {/each}
                <span class="text-xs text-muted-foreground ml-2">
                  → {getCommandLabel(recordingCommandId)}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="rounded-xl"
                  onclick={stopRecording}
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  class="rounded-xl"
                  onclick={confirmOverride}
                >
                  覆盖绑定
                </Button>
              </div>
            </div>
          </div>
        </div>
        <!-- ╭─── / HotkeyConflictBar ───╮ -->
      {:else}
        <!-- Recording status toast -->
        <div
          class="rounded-2xl border border-primary/20 bg-card/95 backdrop-blur-xl
                 shadow-xl px-6 py-3 pointer-events-auto
                 flex items-center gap-4"
        >
          <div
            class="size-2.5 rounded-full bg-primary animate-pulse shrink-0"
          ></div>
          <p class="text-sm font-medium text-foreground">
            正在录制「{getCommandLabel(recordingCommandId)}」的快捷键
          </p>
          <Separator orientation="vertical" class="h-5" />
          <p class="text-xs text-muted-foreground whitespace-nowrap">
            按下组合键 ·
            <kbd
              class="inline-flex items-center rounded-lg border border-border/50
                     bg-muted px-1.5 py-0.5 text-[10px] font-mono font-semibold
                     text-foreground mx-0.5"
            >
              Esc
            </kbd>
            取消
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!--
  ══════════════════════════════════════════════════════════════
  需要的组件：Button, Input, Badge, Separator, Tabs

  建议抽取的子组件：
  → HotkeyManagerHeader.svelte — 页面标题、搜索栏与全局清空按钮
  → HotkeyStatsRow.svelte — 显示绑定统计概览的四张指标卡片
  → HotkeyCommandList.svelte — 分类标签页与命令行列表，含快捷键绑定/录制操作
  → HotkeyCommandRow.svelte — 单条命令行，含标签、描述、快捷键展示与录制状态
  → HotkeyConflictBar.svelte — 快捷键冲突时的底部浮层，含覆盖/取消操作
  ══════════════════════════════════════════════════════════════
-->
