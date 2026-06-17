<!-- TitleBar.svelte -->
<script lang="ts">
  import { IconSun, IconMoon, IconDeviceDesktop } from "@tabler/icons-svelte";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { Separator } from "$lib/components/ui/separator";
  import { windowStore } from "$lib/store/window.svelte";
  import LayoutGroup from "./header/layout.svelte";
  import Brand from "./header/brand.svelte";
  import Winctrl from "./header/winctrl.svelte";
  import { configStore } from "$lib/store/config.svelte";

  type ThemeMode = "light" | "dark" | "system";

  const menus = ["文件", "编辑", "视图", "运行", "终端", "帮助"];
  const menuItems = ["新建文件", "打开...", "保存", "另存为...", "退出"];

  // ── 主题三态轮换：light → dark → system → light ──
  const themeOrder: ThemeMode[] = ["light", "dark", "system"];
  const currentTheme = $derived(configStore.theme);
  const themeLabel = $derived(
    currentTheme === "light"
      ? "浅色主题"
      : currentTheme === "dark"
        ? "深色主题"
        : "跟随系统",
  );

  function cycleTheme() {
    const idx = themeOrder.indexOf(currentTheme);
    configStore.setTheme(themeOrder[(idx + 1) % themeOrder.length]);
  }
</script>

<!--
  修复要点：
  ① 移除 header 上的 -webkit-app-region: drag → 不再全局劫持 pointer 事件
  ② 移除 isolate → 消除层叠上下文隔离对 portal 弹层的影响
  ③ drag 仅设在中部标题区（flex-1 区域），这是唯一需要拖拽的空白地带
  ④ 所有 DropdownMenu.Content / Tooltip.Content 加 z-[200] 确保在最顶层
-->
<header
  class="bg-sidebar text-sidebar-foreground relative z-50 flex h-9 shrink-0 select-none items-center border-b text-xs"
  role="toolbar"
  aria-label="窗口标题栏"
  tabindex="-1"
>
  <Tooltip.Provider delayDuration={300}>
    <!--╭─────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → AppMenu.svelte]                         │ -->
    <!-- │ 职责：应用图标 + 桌面端菜单栏 + 移动端折叠菜单            │ -->
    <!-- ╰─────────────────────────────────────────────────────────╯ -->

    <!-- 应用图标 -->
    <Brand></Brand>

    <!-- 菜单栏（中屏以上显示） -->
    <nav class="hidden items-center md:flex">
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
          <DropdownMenu.Content align="start" class="z-200 min-w-44">
            {#each menuItems as item (item)}
              <DropdownMenu.Item>{item}</DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/each}
    </nav>

    <!-- 移动端折叠菜单 -->
    <div class="md:hidden">
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
        <DropdownMenu.Content align="start" class="z-200">
          {#each menus as m (m)}
            <DropdownMenu.Item>{m}</DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
    <!-- ╭─── / AppMenu ───╮ -->

    <!-- ╭─────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → WindowTitle.svelte]                      │ -->
    <!-- │ 职责：中部标题文字显示 + 唯一的窗口拖拽区域               │ -->
    <!-- ╰─────────────────────────────────────────────────────────╯ -->
    <div
      class="flex flex-1 items-center justify-center px-2"
      style="-webkit-app-region: drag;"
      role="button"
      tabindex="0"
      ondblclick={() => windowStore.maximize()}
    >
      <span class="text-muted-foreground truncate">{windowStore.title}</span>
    </div>
    <!-- ╭─── / WindowTitle ───╮ -->

    <!-- ╭─────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → ThemeCycler.svelte]                      │ -->
    <!-- │ 职责：主题三态轮换 light → dark → system → light         │ -->
    <!-- ╰─────────────────────────────────────────────────────────╯ -->
    <div class="flex items-center">
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
        <Tooltip.Content class="z-200">{themeLabel}（点击切换）</Tooltip.Content
        >
      </Tooltip.Root>
    </div>
    <!-- ╭─── / ThemeCycler ───╮ -->

    <!-- 分隔竖线 -->
    <Separator orientation="vertical" class="mx-1 h-5" />

    <!-- ╭─────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → LayoutToggles.svelte]                    │ -->
    <!-- │ 职责：左侧栏/底部面板/右侧栏三栏开关                     │ -->
    <!-- ╰─────────────────────────────────────────────────────────╯ -->
    <!-- ╭─── / LayoutToggles ───╮ -->
    <LayoutGroup></LayoutGroup>

    <!--
      窗口控制：最小化 / 最大化-还原 / 关闭
      z-60 保证永远可点、永不被遮挡。
    -->
    <Winctrl></Winctrl>
  </Tooltip.Provider>
</header>

<style>
  :global(.group:last-child:hover) {
    background-color: oklch(0.637 0.237 25.331) !important;
    color: white !important;
  }
</style>
