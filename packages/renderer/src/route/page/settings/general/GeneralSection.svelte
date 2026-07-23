<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import { configStore } from "$lib/store/config.svelte";
  import type { AppConfig } from "@app/main/types";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconChartDots3,
    IconCheck,
    IconChevronDown,
    IconDeviceSim,
    IconLanguage,
    IconPalette,
    IconWorldSearch,
  } from "@tabler/icons-svelte";

  let langOpen = $state(false);
  let themeOpen = $state(false);

  const LANGUAGES = [
    { value: "zh-CN", label: "简体中文" },
    { value: "zh-TW", label: "繁體中文" },
    { value: "en", label: "English" },
  ];

  const THEMES = [
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
    { value: "system", label: "跟随系统" },
  ];

  // 常见 OTel 兼容收集器端点（本地版优先）
  type Endpoint = { url: string; label: string };
  const TELEMETRY_ENDPOINTS: Endpoint[] = [
    {
      url: "http://localhost:6006/v1/traces",
      label: "Arize Phoenix (本地 · 默认)",
    },
    {
      url: "http://localhost:4318/v1/traces",
      label: "OTLP HTTP (本地 · 标准端口)",
    },
    { url: "http://localhost:4317", label: "OTLP gRPC (本地 · 标准端口)" },
    {
      url: "http://127.0.0.1:6006/v1/traces",
      label: "Arize Phoenix (127.0.0.1)",
    },
    { url: "http://localhost:16686/v1/traces", label: "Jaeger (本地)" },
    {
      url: "http://localhost:3100/otlp/v1/traces",
      label: "Grafana Tempo (本地)",
    },
    {
      url: "http://localhost:55681/v1/traces",
      label: "OTel Collector (Legacy 端口)",
    },
    {
      url: "https://app.phoenix.arize.com/v1/traces",
      label: "Arize Phoenix (云端)",
    },
  ];

  const languageLabel = $derived(
    LANGUAGES.find((o) => o.value === configStore.lang)?.label ??
      configStore.lang,
  );
  const themeLabel = $derived(
    THEMES.find((o) => o.value === configStore.theme)?.label ??
      configStore.theme,
  );

  // 硬件加速：读写定向
  const disableHAProxy = {
    get value() {
      return configStore.disableHA;
    },
    set value(newValue: boolean) {
      configStore.setDisableHA(newValue);
    },
  };

  // 收集器地址：读只读 store，写 setConfig
  const telemetryProxy = {
    get value(): string {
      return configStore.telemetry ?? "";
    },
    set value(newValue: string) {
      const trimmed = newValue.trim();
      if (trimmed === (configStore.telemetry ?? "")) return;
      void configStore.setConfig("telemetry", trimmed);
    },
  };

  let telemetryOpen = $state(false);
  let telemetryDraft = $state("");
  let activeIndex = $state(-1);

  function openTelemetry(open: boolean) {
    telemetryOpen = open;
    if (open) {
      telemetryDraft = telemetryProxy.value;
      activeIndex = -1;
    } else {
      // 关闭即提交草稿（自由输入也生效）
      telemetryProxy.value = telemetryDraft;
    }
  }

  const filteredEndpoints = $derived.by(() => {
    const q = telemetryDraft.trim().toLowerCase();
    if (!q) return TELEMETRY_ENDPOINTS;
    return TELEMETRY_ENDPOINTS.filter(
      (e) =>
        e.url.toLowerCase().includes(q) || e.label.toLowerCase().includes(q),
    );
  });

  function pick(url: string) {
    telemetryDraft = url;
    telemetryProxy.value = url;
    telemetryOpen = false;
  }

  function onKeydown(e: KeyboardEvent) {
    const list = filteredEndpoints;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = list.length ? (activeIndex + 1) % list.length : -1;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = list.length
        ? (activeIndex - 1 + list.length) % list.length
        : -1;
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && list[activeIndex]) {
        e.preventDefault();
        pick(list[activeIndex].url);
      } else {
        telemetryProxy.value = telemetryDraft;
        telemetryOpen = false;
      }
    }
  }
</script>

<section class="space-y-4">
  <h2 class="text-lg font-medium text-foreground px-1">通用</h2>
  <div
    class="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-border"
  >
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → SettingSelectRow.svelte]              │ -->
    <!-- │ 职责：图标+标题+描述 与 Popover 下拉选择组合的设置行  │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
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
    <!-- ╭─── / SettingSelectRow ───╮ -->

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

    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → TelemetryEndpointRow.svelte]          │ -->
    <!-- │ 职责：OTel 收集器地址配置，Popover 向上弹出避免裁切   │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <!-- Row: 遥测收集器地址 -->
    <div
      class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconChartDots3
            size={20}
            stroke={1.5}
            class="text-muted-foreground"
          />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">遥测收集器地址</p>
          <p class="text-xs text-muted-foreground mt-0.5 max-w-md">
            兼容 OTel 的收集器地址（如arize-phoenix）。
          </p>
        </div>
      </div>

      <!-- Popover 走 Portal 浮层，不受父级 overflow-hidden 裁切，side=top 向上弹出 -->
      <Popover.Root bind:open={telemetryOpen} onOpenChange={openTelemetry}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class="flex items-center justify-between gap-2 h-9 w-full sm:w-72 rounded-xl border border-input bg-background px-3 text-sm transition-all duration-200 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
            >
              <span
                class={`truncate ${telemetryProxy.value ? "text-foreground" : "text-muted-foreground"}`}
              >
                {telemetryProxy.value || "http://localhost:6006/v1/traces"}
              </span>
              <IconChevronDown
                size={16}
                stroke={1.5}
                class={`text-muted-foreground transition-transform duration-200 ${telemetryOpen ? "rotate-180" : ""}`}
              />
            </button>
          {/snippet}
        </Popover.Trigger>

        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          class="rounded-xl p-0 w-[min(22rem,90vw)] overflow-hidden"
        >
          <!-- 输入区 -->
          <div class="relative border-b border-border/50 p-2">
            <IconWorldSearch
              size={16}
              stroke={1.5}
              class="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              value={telemetryDraft}
              oninput={(e) => {
                telemetryDraft = e.currentTarget.value;
                activeIndex = -1;
              }}
              onkeydown={onKeydown}
              placeholder="http://localhost:6006/v1/traces"
              autocomplete="off"
              spellcheck="false"
              class="h-9 w-full rounded-lg bg-background pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          <!-- 建议列表：向上弹出后位于按钮上方，无遮挡；自身细滚动条 -->
          <div class="max-h-56 overflow-y-auto p-1" use:autoAnimate>
            {#if filteredEndpoints.length > 0}
              {#each filteredEndpoints as opt, i (opt.url)}
                <button
                  onclick={() => pick(opt.url)}
                  onmouseenter={() => (activeIndex = i)}
                  class={`w-full flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-all duration-200 ${i === activeIndex ? "bg-accent" : "hover:bg-accent"}`}
                >
                  <span class="text-sm text-foreground truncate w-full">
                    {opt.url}
                  </span>
                  <span class="text-xs text-muted-foreground truncate w-full">
                    {opt.label}
                  </span>
                </button>
              {/each}
            {:else}
              <div class="px-3 py-4 text-center text-xs text-muted-foreground">
                未匹配到预设端点，回车即可使用当前自定义地址。
              </div>
            {/if}
          </div>
        </Popover.Content>
      </Popover.Root>
    </div>
    <!-- ╭─── / TelemetryEndpointRow ───╮ -->
  </div>
</section>
