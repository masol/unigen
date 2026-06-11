<!-- TitleBar.svelte -->
<script lang="ts">
  import {
    IconMinus,
    IconSquare,
    IconCopy,
    IconX,
    IconSun,
    IconMoon,
    IconDeviceDesktop,
  } from "@tabler/icons-svelte";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { Separator } from "$lib/components/ui/separator";
  import { setMode, userPrefersMode } from "mode-watcher";
  import { windowStore } from "$lib/store/window.svelte";
  import LayoutGroup from "./header/layout.svelte";

  type ThemeMode = "light" | "dark" | "system";

  const menus = ["文件", "编辑", "视图", "运行", "终端", "帮助"];
  const menuItems = ["新建文件", "打开...", "保存", "另存为...", "退出"];

  // ── 主题三态轮换：light → dark → system → light ──
  const themeOrder: ThemeMode[] = ["light", "dark", "system"];
  const currentTheme = $derived(
    (userPrefersMode.current ?? "system") as ThemeMode,
  );
  const themeLabel = $derived(
    currentTheme === "light"
      ? "浅色主题"
      : currentTheme === "dark"
        ? "深色主题"
        : "跟随系统",
  );

  function cycleTheme() {
    const idx = themeOrder.indexOf(currentTheme);
    setMode(themeOrder[(idx + 1) % themeOrder.length]);
  }
</script>

<!--标题栏布局（从左到右）：
  [应用图标 +菜单]→  [中部标题(flex-1)]  →  [主题切换]  →  [竖线]  →  [三栏开关]  →  [窗口控制]
-->
<header
  class="bg-sidebar text-sidebar-foreground relative isolate z-50 flex h-9 shrink-0 select-none items-center border-b text-xs"
  style="-webkit-app-region: drag;"
  role="toolbar"
  aria-label="窗口标题栏"
  tabindex="-1"
  ondblclick={() => windowStore.maximize()}
>
  <Tooltip.Provider delayDuration={300}>
    <!--╭─────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → AppMenu.svelte]│ -->
    <!-- │ 职责：应用图标 + 桌面端菜单栏 + 移动端折叠菜单            │ -->
    <!-- ╰─────────────────────────────────────────────────────────╯ -->
    <div
      class="flex h-full items-center px-2.5"
      style="-webkit-app-region: no-drag;"
    >
      <div
        class="flex h-5 w-5 items-center justify-center rounded bg-linear-to-br from-sky-500 to-violet-500 text-[10px] font-bold text-white"
      >
        H
      </div>
    </div>

    <!--菜单栏（中屏以上显示） -->
    <nav
      class="hidden items-center md:flex"
      style="-webkit-app-region: no-drag;"
    >
      {#each menus as m (m)}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="sm"
                class="h-9 rounded-none px-2.5 font-normal hover:bg-accent/80"
              >
                {m}
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="min-w-44">
            {#each menuItems as item (item)}
              <DropdownMenu.Item>{item}</DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/each}
    </nav>

    <!-- 移动端折叠菜单 -->
    <div class="md:hidden" style="-webkit-app-region: no-drag;">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="sm"
              class="h-9 rounded-none px-2 font-normal hover:bg-accent/80"
            >
              菜单
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start">
          {#each menus as m (m)}
            <DropdownMenu.Item>{m}</DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
    <!-- ╭─── / AppMenu ───╮ -->

    <!-- ╭─────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → WindowTitle.svelte]                      │ -->
    <!-- │ 职责：中部标题文字显示（拖拽区）                          │ -->
    <!-- ╰─────────────────────────────────────────────────────────╯ -->
    <div class="flex flex-1 items-center justify-center px-2">
      <span class="text-muted-foreground truncate">{windowStore.title}</span>
    </div>
    <!-- ╭─── / WindowTitle ───╮ -->

    <!-- ╭─────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → ThemeCycler.svelte]                      │ -->
    <!-- │ 职责：主题三态轮换 light → dark → system → light         │ -->
    <!-- ╰─────────────────────────────────────────────────────────╯ -->
    <div class="flex items-center" style="-webkit-app-region: no-drag;">
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              onclick={cycleTheme}
              variant="ghost"
              size="icon"
              class="size-9 rounded-none hover:bg-accent/80"
            >
              {#if currentTheme === "light"}
                <IconSun size={16} />
              {:else if currentTheme === "dark"}
                <IconMoon size={16} />
              {:else}
                <IconDeviceDesktop size={16} />
              {/if}
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{themeLabel}（点击切换）</Tooltip.Content>
      </Tooltip.Root>
    </div>
    <!-- ╭─── / ThemeCycler ───╮ -->

    <!-- 分隔竖线 -->
    <Separator orientation="vertical" class="mx-1 h-5" />

    <!-- ╭─────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → LayoutToggles.svelte]                    │ -->
    <!-- │ 职责：左侧栏/底部面板/右侧栏三栏开关，│ -->
    <!-- │使用 Collapse/Expand 图标表达开关状态               │ -->
    <!-- ╰─────────────────────────────────────────────────────────╯ -->
    <LayoutGroup></LayoutGroup>
    <!-- ╭─── / LayoutToggles ───╮ --><!--
      窗口控制：最小化 / 最大化-还原 / 关闭
      z-60 + relative + no-drag + pointer-events-auto：
      凌驾于标题栏内其它层级之上，保证永远可点、永不被遮挡。
    -->
    <div
      class="pointer-events-auto relative z-60 flex items-center"
      style="-webkit-app-region: no-drag;"
    >
      <Button
        onclick={() => windowStore.minimize()}
        variant="ghost"
        size="icon"
        class="h-9 w-11 rounded-none hover:bg-accent/80"
        title="最小化"
      >
        <IconMinus size={16} />
      </Button>

      <Button
        onclick={() => windowStore.toggleMaximize()}
        variant="ghost"
        size="icon"
        class="h-9 w-11 rounded-none hover:bg-accent/80"
        title={windowStore.maxRestoreTooltip}
      >
        {#if windowStore.isMaximized}
          <IconCopy size={14} />
        {:else}
          <IconSquare size={13} />
        {/if}
      </Button>

      <!-- 关闭：hover 变红，!important 确保 dark 模式下不被覆盖 -->
      <Button
        onclick={() => windowStore.close()}
        variant="ghost"
        size="icon"
        class="group h-9 w-11 rounded-none"
        title="关闭"
      >
        <IconX
          size={16}
          class="transition-colors duration-200 group-hover:text-white"
        />
      </Button>
    </div>
  </Tooltip.Provider>
</header>

<style>
  /* 关闭按钮 hover — 用原生 CSS 保证 dark/light 模式均生效，绕开 shadcn ghost variant 的 hover:bg-accent 覆盖问题 */
  :global(.group:last-child:hover) {
    background-color: oklch(0.637 0.237 25.331) !important;
    color: white !important;
  }
</style>
