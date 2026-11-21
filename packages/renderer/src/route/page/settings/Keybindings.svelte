<!-- packages/renderer/src/route/page/settings/Keybindings.svelte -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import * as Tabs from "$lib/components/ui/tabs";
  import { configStore } from "$lib/store/config.svelte";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import { commandCenter } from "$lib/utils/commands/center";
  import { eventToCombo, formatCombo } from "$lib/utils/commands/keycode";
  import type { CommandDescriptor } from "$lib/utils/commands/type";
  import evtbus from "$lib/utils/evtbus";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconAlertTriangle,
    IconCheck,
    IconCommand,
    IconFolder,
    IconKeyboard,
    IconMinus,
    IconPlus,
    IconSearch,
    IconTrash,
    IconX,
  } from "@tabler/icons-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  // ── Types ──────────────────────────────────────────────────
  type CommandInfo = Omit<CommandDescriptor, "handler">;

  // ── Platform ───────────────────────────────────────────────
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  // ── Initialize Commands ────────────────────────────────────
  // devOnly 命令仅在 showDevUI 开启时可见。
  // local 命令在此页保留（用于配置其热键），仅在命令面板中隐藏。
  let allCommands = $derived<CommandInfo[]>(
    commandCenter
      .getAllDescriptors()
      .filter((c) => configStore.showDevUI || !c.devOnly),
  );

  let categories = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const cats = new Set<string>();
    for (const cmd of allCommands) {
      if (cmd.category) cats.add(cmd.category);
    }
    return ["全部", ...Array.from(cats).sort()];
  });

  // ── Reactive Bridge to KeybindConfig ──────────────────────
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
  function formatKeyForDisplay(key: string, mac = isMac): string {
    if (mac) {
      const m: Record<string, string> = {
        ctrl: "⌃",
        command: "⌘",
        alt: "⌥",
        shift: "⇧",
        return: "↩",
        backspace: "⌫",
        delete: "⌦",
        escape: "Esc",
        esc: "Esc",
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
      command: "Win",
      alt: "Alt",
      shift: "Shift",
      return: "Enter",
      backspace: "⌫",
      delete: "Del",
      escape: "Esc",
      esc: "Esc",
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
    return combo.split("+").map((k) => formatKeyForDisplay(k));
  }

  function getCommandLabel(cmdId: string): string {
    return allCommands.find((c) => c.id === cmdId)?.label ?? cmdId;
  }

  // ── Binding Actions ───────────────────────────────────────
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
    // 屏蔽全局热键响应，避免录制时误触已有命令。
    configStore.keybinding.beginRecording();
    if (typeof document !== "undefined")
      (document.activeElement as HTMLElement)?.blur?.();
  }

  function stopRecording() {
    configStore.keybinding.endRecording();
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

    // 单独的 Esc → 取消录制（Esc 不作为可绑定键，用于保留"退出"语义）
    if (
      event.key === "Escape" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      stopRecording();
      return;
    }

    // 组合串（仅修饰键时返回空串）
    const combo = eventToCombo(event);
    if (!combo) return;

    const hasModifier =
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    const isFKey = /^f\d+$/i.test(event.key);

    // 冲突检测
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

    // 单键 + 全局命令：hotkeys-js 的默认 filter 只拦截 input/textarea，
    // 对 contenteditable（如 Tiptap 编辑器）不生效，单键可能误触发。
    // 这里给一次非阻塞提示，仍允许绑定（尊重用户选择）。
    const isSingleKey = !hasModifier && !isFKey;
    const isLocalCommand =
      commandCenter.get(recordingCommandId)?.local === true;
    if (isSingleKey && !isLocalCommand) {
      toast.warning(
        `「${getCommandLabel(recordingCommandId)}」为全局命令，单键 ${formatCombo(combo)} 可能在富文本编辑器中误触发。`,
        { duration: 5000 },
      );
    }

    addBinding(recordingCommandId, combo);
    stopRecording();
  }

  onMount(() => {
    // Electron 主进程 before-input-event 转发的补充捕获路径。
    // 用于捕获 Electron 自身可能拦截的键盘事件（如 Ctrl+W / Ctrl+R 等），
    // 使这些组合键在录制时仍能被识别。
    const handler = (evt: {
      key: string;
      ctrlKey: boolean;
      metaKey: boolean;
      shiftKey: boolean;
      altKey: boolean;
    }) => {
      // 与 DOM KeyboardEvent 结构相关的补充：eventToCombo 只依赖 key 与修饰键。
      handleKeydown({
        ...evt,
        preventDefault: () => {},
        stopPropagation: () => {},
        code: "",
        bubbles: true,
        cancelable: true,
        composed: true,
        type: "keydown",
        target: null,
        currentTarget: null,
      } as unknown as KeyboardEvent);
    };
    evtbus.on("before-input-evt", handler);
    return () => {
      evtbus.off("before-input-evt", handler);
      // 组件卸载时若仍处于录制状态，释放 hotkeys-js 屏蔽。
      configStore.keybinding.endRecording();
    };
  });

  // 命令列表可能因 showDevUI 切换而重算；若当前分类已不可见，回落到"全部"
  $effect(() => {
    if (activeCategory !== "全部" && !categories.includes(activeCategory)) {
      activeCategory = "全部";
    }
  });
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

                <div
                  class="rounded-xl border border-border/50 divide-y divide-border/30 overflow-hidden"
                  use:autoAnimate
                >
                  {#each commands as command (command.id)}
                    <div
                      class={[
                        "flex items-center justify-between px-4 py-3.5 transition-all duration-200 gap-4",
                        recordingCommandId === command.id
                          ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                          : "hover:bg-muted/40",
                      ]}
                    >
                      <div class="flex-1 min-w-0 space-y-0.5">
                        <div class="flex items-center gap-2">
                          <p class="text-sm font-medium text-foreground">
                            {command.label}
                          </p>
                          {#if command.local}
                            <Badge
                              variant="outline"
                              class="rounded-md text-[10px] h-4 px-1"
                              >局部</Badge
                            >
                          {/if}
                          {#if command.devOnly}
                            <Badge
                              variant="outline"
                              class="rounded-md text-[10px] h-4 px-1"
                              >开发者</Badge
                            >
                          {/if}
                        </div>
                        {#if command.description}
                          <p class="text-xs text-muted-foreground truncate">
                            {command.description}
                          </p>
                        {/if}
                      </div>

                      <div class="flex items-center gap-3 shrink-0">
                        {#if recordingCommandId === command.id}
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
                  {/each}
                </div>
              </section>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  </div>
  <!-- ════════ Recording Floating Bar ════════ -->
  {#if recordingCommandId}
    <div
      class="fixed bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none px-6
             animate-slide-up"
    >
      {#if conflictCommandId && pendingCombo}
        {@const conflictKeys = parseComboForDisplay(pendingCombo)}
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
      {:else}
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
            按下组合键 · 支持单键（如 Enter）·
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
