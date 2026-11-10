<!-- packages/renderer/src/route/page/settings/general/GeneralSection.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Popover from "$lib/components/ui/popover";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import { configStore } from "$lib/store/config.svelte";
  import { api } from "$lib/utils/api";
  import type { AppConfig } from "@app/main/types";
  import {
    IconCheck,
    IconChevronDown,
    IconDeviceSim,
    IconFolder,
    IconFolderOpen,
    IconLanguage,
    IconPalette,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";

  let langOpen = $state(false);
  let themeOpen = $state(false);

  const LANGUAGES = [
    { value: "zh-CN", label: "简体中文" },
    // { value: "zh-TW", label: "繁體中文" },
    // { value: "en", label: "English" },
  ];

  const THEMES = [
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
    { value: "system", label: "跟随系统" },
  ];

  const languageLabel = $derived(
    LANGUAGES.find((o) => o.value === configStore.lang)?.label ??
      configStore.lang,
  );
  const themeLabel = $derived(
    THEMES.find((o) => o.value === configStore.theme)?.label ??
      configStore.theme,
  );

  // 硬件加速:读写定向
  const disableHAProxy = {
    get value() {
      return configStore.disableHA;
    },
    set value(newValue: boolean) {
      configStore.setDisableHA(newValue);
    },
  };

  // ───────────────────────────────────────────────────────────
  // 项目基础目录:通过主进程原生对话框选择
  // ───────────────────────────────────────────────────────────
  const taskDirProxy = {
    get value(): string {
      return configStore.task_dir ?? "";
    },
    set value(newValue: string) {
      const trimmed = newValue.trim();
      if (trimmed === (configStore.task_dir ?? "")) return;
      void configStore.setConfig("task_dir", trimmed);
    },
  };

  async function pickTaskDir() {
    try {
      const result = await api().system.selectDirectory({
        title: "选择项目基础目录",
        defaultPath: taskDirProxy.value || undefined,
      });
      if (result.canceled || !result.path) return;
      taskDirProxy.value = result.path;
      toast.success("项目基础目录已更新");
    } catch (e) {
      toast.error(
        `选择目录失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // async function revealTaskDir() {
  //   if (!taskDirProxy.value) return;
  //   await api().system.showItemInFolder({ path: taskDirProxy.value });
  // }
</script>

<section class="space-y-4">
  <h2 class="text-lg font-medium text-foreground px-1">通用</h2>
  <div
    class="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-border"
  >
    <!-- Row: 界面语言 -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconLanguage size={20} stroke={1.5} class="text-muted-foreground" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">界面语言</p>
          <p class="text-xs text-muted-foreground mt-0.5">设置应用的显示语言</p>
        </div>
      </div>
      <Popover.Root bind:open={langOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class="flex items-center justify-between gap-2 h-9 w-full sm:w-48 rounded-xl border border-input bg-background px-3 text-sm transition-all duration-200 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
            >
              <span class="truncate text-foreground">{languageLabel}</span>
              <IconChevronDown
                size={16}
                stroke={1.5}
                class={`text-muted-foreground transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`}
              />
            </button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content
          align="end"
          sideOffset={6}
          class="rounded-xl p-1.5 w-52"
        >
          <div class="space-y-0.5">
            {#each LANGUAGES as option (option.value)}
              <button
                class={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all duration-200 hover:bg-accent ${configStore.lang === option.value ? "bg-accent" : ""}`}
                onclick={() => {
                  configStore.setLang(option.value);
                  langOpen = false;
                }}
              >
                <span class="text-foreground">{option.label}</span>
                {#if configStore.lang === option.value}
                  <IconCheck
                    size={16}
                    stroke={1.5}
                    class="text-primary shrink-0"
                  />
                {/if}
              </button>
            {/each}
          </div>
        </Popover.Content>
      </Popover.Root>
    </div>

    <Separator class="bg-border/30" />

    <!-- Row: 界面颜色 -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconPalette size={20} stroke={1.5} class="text-muted-foreground" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">界面颜色</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            选择浅色、深色或跟随系统主题
          </p>
        </div>
      </div>
      <Popover.Root bind:open={themeOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class="flex items-center justify-between gap-2 h-9 w-full sm:w-48 rounded-xl border border-input bg-background px-3 text-sm transition-all duration-200 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
            >
              <span class="truncate text-foreground">{themeLabel}</span>
              <IconChevronDown
                size={16}
                stroke={1.5}
                class={`text-muted-foreground transition-transform duration-200 ${themeOpen ? "rotate-180" : ""}`}
              />
            </button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content
          align="end"
          sideOffset={6}
          class="rounded-xl p-1.5 w-52"
        >
          <div class="space-y-0.5">
            {#each THEMES as option (option.value)}
              <button
                class={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all duration-200 hover:bg-accent ${configStore.theme === option.value ? "bg-accent" : ""}`}
                onclick={() => {
                  configStore.setTheme(option.value as AppConfig["theme"]);
                  themeOpen = false;
                }}
              >
                <span class="text-foreground">{option.label}</span>
                {#if configStore.theme === option.value}
                  <IconCheck
                    size={16}
                    stroke={1.5}
                    class="text-primary shrink-0"
                  />
                {/if}
              </button>
            {/each}
          </div>
        </Popover.Content>
      </Popover.Root>
    </div>

    <Separator class="bg-border/30" />

    <!-- Row: UI 禁用硬件加速 -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconDeviceSim size={20} stroke={1.5} class="text-muted-foreground" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">UI禁用硬件加速</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            禁用UI界面的硬件加速(重启生效)
          </p>
        </div>
      </div>
      <Switch bind:checked={disableHAProxy.value} class="shrink-0" />
    </div>

    <Separator class="bg-border/30" />

    <!-- Row: 项目根目录 -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconFolder size={20} stroke={1.5} class="text-muted-foreground" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">项目仓库(新建或打开项目默认的根目录)</p>
          <p
            class="text-xs mt-0.5 truncate max-w-md font-mono"
            class:text-muted-foreground={!taskDirProxy.value}
            class:text-foreground={!!taskDirProxy.value}
            title={taskDirProxy.value || "尚未设置"}
          >
            {taskDirProxy.value || "尚未设置,将使用默认目录"}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        class="rounded-xl gap-2 shrink-0 transition-all duration-200"
        onclick={pickTaskDir}
      >
        <IconFolderOpen size={16} stroke={1.5} />
        选择目录
      </Button>
    </div>
  </div>
</section>
