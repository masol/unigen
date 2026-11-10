<!-- packages/renderer/src/route/page/settings/develops/GeneralSection.svelte -->
<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import { Switch } from "$lib/components/ui/switch";
  import { configStore } from "$lib/store/config.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconChevronDown,
    IconCircuitBulb,
    IconWorldSearch,
  } from "@tabler/icons-svelte";
  import SettingRow from "./SettingRow.svelte";
  import SettingsSection from "./SettingsSection.svelte";

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

  // 收集器地址:读只读 store,写 setConfig
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

<SettingsSection icon={IconCircuitBulb} title="通用" description="开发相关配置">
  <SettingRow
    title="启用开发"
    description="启用开发界面，可以深入管理AI，需要技术知识。"
  >
    {#snippet control()}
      <Switch
        bind:checked={
          () => configStore.showDevUI,
          (v) => configStore.setConfig("showDevUI", v)
        }
      />
    {/snippet}
  </SettingRow>

  <!-- 并行执行 -->
  <SettingRow title="并行执行" description="允许AI并行执行对话任务。">
    {#snippet control()}
      <Switch
        bind:checked={
          () => configStore.parallelRun,
          (v) => configStore.setConfig("parallelRun", v)
        }
      />
    {/snippet}
  </SettingRow>

  <!-- 遥测收集器地址 -->
  <SettingRow
    title="遥测收集器地址"
    description="兼容 OTel 的收集器地址（如 arize-phoenix）。"
  >
    {#snippet control()}
      <Popover.Root bind:open={telemetryOpen} onOpenChange={openTelemetry}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class="flex items-center justify-between gap-2 h-9 w-72 max-w-[70vw] rounded-xl border border-input bg-background px-3 text-sm transition-all duration-200 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
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

          <div class="max-h-56 overflow-y-auto p-1" use:autoAnimate>
            {#if filteredEndpoints.length > 0}
              {#each filteredEndpoints as opt, i (opt.url)}
                <button
                  onclick={() => pick(opt.url)}
                  onmouseenter={() => (activeIndex = i)}
                  class={`w-full flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-all duration-200 ${i === activeIndex ? "bg-accent" : "hover:bg-accent"}`}
                >
                  <span class="text-sm text-foreground truncate w-full"
                    >{opt.url}</span
                  >
                  <span class="text-xs text-muted-foreground truncate w-full"
                    >{opt.label}</span
                  >
                </button>
              {/each}
            {:else}
              <div class="px-3 py-4 text-center text-xs text-muted-foreground">
                未匹配到预设端点,回车即可使用当前自定义地址。
              </div>
            {/if}
          </div>
        </Popover.Content>
      </Popover.Root>
    {/snippet}
  </SettingRow>
</SettingsSection>
