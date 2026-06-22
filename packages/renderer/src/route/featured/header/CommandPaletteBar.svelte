<!-- CommandPaletteBar.svelte -->
<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { fly, fade } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import hotkeys from "hotkeys-js";
  import {
    IconSearch,
    IconChevronRight,
    IconCornerDownLeft,
    IconArrowUp,
    IconArrowDown,
  } from "@tabler/icons-svelte";
  import { commandCenter } from "$lib/utils/commands/center";
  import { configStore } from "$lib/store/config.svelte";
  import { projectStore } from "$lib/store/project.svelte";

  // ─── Types ───
  interface CommandEntry {
    id: string;
    label: string;
    category: string;
    description: string;
  }

  // ─── State ───
  let isOpen = $state(false);
  let query = $state("");
  let title = $derived(projectStore.path || "unigen");
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement | undefined = $state();

  const allCommands = $derived(
    commandCenter.getAllDescriptors() as CommandEntry[],
  );

  const filtered = $derived.by(() => {
    const lower = query.toLowerCase().trim();
    if (!lower) return allCommands;
    return allCommands.filter((c) =>
      `${c.id} ${c.label} ${c.description} ${c.category}`
        .toLowerCase()
        .includes(lower),
    );
  });

  const grouped = $derived.by(() => {
    const groups: Record<string, CommandEntry[]> = {};
    for (const cmd of filtered) {
      const cat = cmd.category || "(Uncategorized)";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cmd);
    }
    return groups;
  });

  const flatList = $derived.by(() => {
    const result: CommandEntry[] = [];
    for (const cat of Object.keys(grouped)) result.push(...grouped[cat]);
    return result;
  });

  const categories = $derived(Object.keys(grouped));

  function getHotkeyForCommand(id: string): string | null {
    return configStore.keybinding.getHotkeyForCommand(id) ?? null;
  }

  // ─── 健壮聚焦：自检 + 自动重试 ───
  // 解决两个时序问题：
  //  1. hotkeys-js 触发回调时浏览器焦点仍未释放，单次 focus() 可能被随后的事件覆盖。
  //  2. 某些 OS / WebView 在窗口未激活时第一帧 focus() 静默失败。
  async function focusInputRobustly(maxRetries = 25) {
    await tick(); // 等待 {#if isOpen} 块挂载，inputEl 才会被 bind 赋值
    for (let i = 0; i < maxRetries; i++) {
      if (!isOpen) return; // 中途被关闭则放弃
      if (!inputEl) {
        await new Promise((r) => requestAnimationFrame(r));
        continue;
      }
      inputEl.focus();
      // 关键自检：浏览器可能拒绝本次 focus（异步竞争）
      if (document.activeElement === inputEl) return;
      await new Promise((r) => requestAnimationFrame(r));
    }
    console.error("not focus!!!")
  }

  // ─── Actions ───
  async function open() {
    isOpen = true;
    query = "";
    selectedIndex = 0;
    await focusInputRobustly();
  }

  function close() {
    isOpen = false;
    query = "";
    selectedIndex = 0;
  }

  async function executeCommand(cmd: CommandEntry) {
    close();
    const result = await commandCenter.execute(cmd.id);
    if (!result.success && result.error) {
      console.error(`[CommandPalette] ${cmd.id} failed:`, result.error);
    }
  }

  function moveSelection(delta: number) {
    if (!flatList.length) return;
    selectedIndex = (selectedIndex + delta + flatList.length) % flatList.length;
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-cmd-index="${selectedIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  // ─── 全局键盘处理：彻底摆脱「必须 input 聚焦」的约束 ───
  // 面板打开期间，无论焦点在何处，方向键 / Enter / Esc 都能正常工作。
  // 这同时也是 inputEl 偶发 focus 失败时的最终兜底。
  function handleWindowKeydown(e: KeyboardEvent) {
    if (!isOpen) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === "Enter") {
      // 仅当焦点确实在 input 或面板内时响应 Enter，避免误触发其他场景
      if (
        document.activeElement === inputEl ||
        !document.activeElement ||
        document.activeElement === document.body
      ) {
        e.preventDefault();
        const cmd = flatList[selectedIndex];
        if (cmd) executeCommand(cmd);
      }
    }
  }

  // 查询变化时，重置选中项 + 如果焦点丢失则补救一次
  $effect(() => {
    void query;
    selectedIndex = 0;
  });

  // 面板状态变化时，确保输入框获得焦点（响应式兜底）
  $effect(() => {
    if (isOpen) {
      focusInputRobustly();
    }
  });

  // ─── Lifecycle ───
  onMount(() => {
    hotkeys("ctrl+p, ctrl+shift+p", (e) => {
      e.preventDefault();
      if (isOpen) {
        close();
      } else {
        open();
      }
    });
  });

  onDestroy(() => {
    hotkeys.unbind("ctrl+p");
    hotkeys.unbind("ctrl+shift+p");
  });
</script>

<!-- 全局键盘监听：面板打开时方向键 / Enter / Esc 永远可用 -->
<svelte:window onkeydown={handleWindowKeydown} />

<!--╭─────────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → CommandPaletteBar.svelte]               │ -->
<!-- │ 职责：VSCode 标题栏占位触发条 + 原地下拉命令面板         │ -->
<!-- ╰─────────────────────────────────────────────────────────╯ -->
<div class="relative w-full max-w-md" style="-webkit-app-region: no-drag;">
  <!-- ── 占位触发条 ── -->
  <button
    type="button"
    onclick={open}
    class="flex h-6 w-full items-center justify-center gap-2 rounded-md border border-sidebar-border/70 bg-sidebar-accent/40 text-center transition-colors duration-200 hover:bg-sidebar-accent"
    aria-haspopup="listbox"
    aria-expanded={isOpen}
  >
    <IconSearch
      size={12}
      stroke={1.5}
      class="shrink-0 text-sidebar-foreground/60"
    />
    <span class="truncate text-xs text-sidebar-foreground/70">{title}</span>
  </button>

  {#if isOpen}
    <div
      transition:fly={{ y: -6, duration: 180, easing: quintOut }}
      class="absolute left-1/2 top-0 z-200 w-120 max-w-[92vw] -translate-x-1/2 overflow-hidden rounded-xl border border-border/50 bg-popover text-popover-foreground shadow-2xl"
      style="-webkit-app-region: no-drag;"
      role="listbox"
    >
      <!-- 搜索输入 -->
      <div
        class="flex items-center gap-2.5 border-b border-border/50 px-3.5 py-2.5"
      >
        <IconSearch
          size={16}
          stroke={1.5}
          class="shrink-0 text-muted-foreground"
        />
        <input
          bind:this={inputEl}
          bind:value={query}
          type="text"
          placeholder="Type a command…"
          autocomplete="off"
          spellcheck="false"
          class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <!-- 分组命令列表 -->
      <div class="cmd-scroll max-h-85 overflow-y-auto p-1.5">
        {#if flatList.length === 0}
          <div
            class="flex flex-col items-center justify-center gap-2 py-10 text-center"
          >
            <div class="rounded-lg bg-muted p-2.5">
              <IconSearch
                size={16}
                stroke={1.5}
                class="text-muted-foreground"
              />
            </div>
            <p class="text-sm text-muted-foreground">No matching commands</p>
          </div>
        {:else}
          {#each categories as category (category)}
            <div class="mb-1">
              <div class="flex items-center gap-1.5 px-2 py-1.5">
                <span
                  class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {category}
                </span>
                <span class="text-[10px] text-muted-foreground/60">
                  {grouped[category].length}
                </span>
              </div>

              <ul class="space-y-0.5">
                {#each grouped[category] as cmd (cmd.id)}
                  {@const globalIndex = flatList.findIndex(
                    (c) => c.id === cmd.id,
                  )}
                  {@const isSelected = selectedIndex === globalIndex}
                  {@const hotkey = getHotkeyForCommand(cmd.id)}
                  <li>
                    <button
                      type="button"
                      data-cmd-index={globalIndex}
                      onclick={() => executeCommand(cmd)}
                      onmouseenter={() => (selectedIndex = globalIndex)}
                      class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-200 {isSelected
                        ? 'bg-primary/10'
                        : 'hover:bg-muted'}"
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div
                        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors duration-200 {isSelected
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground'}"
                      >
                        <IconChevronRight size={11} stroke={1.5} />
                      </div>

                      <div class="min-w-0 flex-1">
                        <p
                          class="truncate text-sm font-medium leading-tight text-foreground"
                        >
                          {cmd.label}
                        </p>
                        {#if cmd.description}
                          <p
                            class="mt-0.5 truncate text-xs text-muted-foreground"
                          >
                            {cmd.description}
                          </p>
                        {/if}
                      </div>

                      {#if hotkey}
                        <kbd
                          class="shrink-0 rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {hotkey}
                        </kbd>
                      {/if}

                      {#if isSelected}
                        <IconCornerDownLeft
                          size={12}
                          stroke={1.5}
                          class="shrink-0 text-primary"
                        />
                      {/if}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        {/if}
      </div>

      <!-- 底部键盘提示 -->
      <div
        class="flex items-center justify-between border-t border-border/50 bg-muted/30 px-3.5 py-2"
      >
        <div
          class="flex items-center gap-2.5 text-[10px] text-muted-foreground"
        >
          <span class="flex items-center gap-1">
            <kbd
              class="rounded-md border border-border/50 bg-background px-1 py-0.5 font-mono"
            >
              <IconArrowUp size={10} stroke={1.5} class="inline" />
            </kbd>
            <kbd
              class="rounded-md border border-border/50 bg-background px-1 py-0.5 font-mono"
            >
              <IconArrowDown size={10} stroke={1.5} class="inline" />
            </kbd>
          </span>
          <span class="flex items-center gap-1">
            <kbd
              class="rounded-md border border-border/50 bg-background px-1 py-0.5 font-mono"
            >
              <IconCornerDownLeft size={10} stroke={1.5} class="inline" />
            </kbd>
            run
          </span>
          <span class="flex items-center gap-1">
            <kbd
              class="rounded-md border border-border/50 bg-background px-1.5 py-0.5 font-mono"
              >esc</kbd
            >
          </span>
        </div>
        <span class="text-[10px] text-muted-foreground/70"
          >{flatList.length}</span
        >
      </div>
    </div>
  {/if}
</div>

<!-- 全屏透明遮罩 -->
{#if isOpen}
  <div
    transition:fade={{ duration: 120 }}
    class="fixed inset-0 z-100"
    style="-webkit-app-region: no-drag;"
    onclick={close}
    onkeydown={() => {}}
    role="button"
    tabindex="-1"
    aria-label="Close command palette"
  ></div>
{/if}

<style>
  .cmd-scroll::-webkit-scrollbar {
    width: 8px;
  }
  .cmd-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .cmd-scroll::-webkit-scrollbar-thumb {
    background: hsl(var(--muted));
    border-radius: 4px;
  }
  .cmd-scroll::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--muted-foreground) / 0.3);
  }
</style>
