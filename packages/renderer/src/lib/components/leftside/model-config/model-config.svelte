<!-- packages/renderer/src/lib/components/leftside/model-config/model-config.svelte -->
<script lang="ts">
  import { Switch } from "$lib/components/ui/switch";
  import { modelConfigStore } from "$lib/store/local/model-config.store.svelte";
  import { onMount } from "svelte";
  import { push, router } from "svelte-spa-router";
  import DebouncedNumberInput from "./DebouncedNumberInput.svelte";
  import { NAV_SECTIONS } from "./model-config.types";
  import ModelConfigSection from "./ModelConfigSection.svelte";
  import ModelSelector from "./ModelSelector.svelte";
  import ReasoningLevelSelect from "./ReasoningLevelSelect.svelte";
  import SettingRow from "./SettingRow.svelte";
  import TemperatureSlider from "./TemperatureSlider.svelte";

  type Props = {
    onsettingschange?: (payload: Record<string, unknown>) => void;
  };

  let { onsettingschange }: Props = $props();

  let openSections = $state<Record<string, boolean>>({ model: true });

  function toggleSection(id: string) {
    openSections = openSections[id] ? {} : { [id]: true };
  }

  function isSectionOpen(id: string): boolean {
    return openSections[id] ?? false;
  }

  function toggleModelOverride(enabled: boolean) {
    modelConfigStore.userSelModelEnabled = enabled;
  }

  onMount(() => {
    if (router.location !== "/") {
      push("/");
    }
  });

  let lastDispatched = "";

  $effect(() => {
    const serialized = JSON.stringify(modelConfigStore.payload);
    if (serialized === lastDispatched) return;
    lastDispatched = serialized;
    onsettingschange?.(modelConfigStore.payload);
    modelConfigStore.scheduleSave();
  });
</script>

<div class="space-y-3">
  <div
    class="rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
  >
    先打开覆盖开关，然后设置。
  </div>

  {#each NAV_SECTIONS as section (section.id)}
    <ModelConfigSection
      title={section.label}
      description={section.description}
      icon={section.icon}
      open={isSectionOpen(section.id)}
      onopenchange={() => toggleSection(section.id)}
      overriddenCount={modelConfigStore.overrideCountBySection[section.id] ?? 0}
    >
      {#if section.id === "model"}
        <div class="space-y-3">
          <SettingRow
            label="模型"
            overridden={modelConfigStore.userSelModelEnabled}
            ontoggle={toggleModelOverride}
            help="指定AI使用的模型。"
          >
            <ModelSelector />
          </SettingRow>

          <SettingRow
            label="思考深度"
            overridden={modelConfigStore.reasoning !== null}
            ontoggle={(v) =>
              (modelConfigStore.reasoning = v ? "provider-default" : null)}
            help="并非所有模型都支持全部级别；不支持时就近降级。"
          >
            <ReasoningLevelSelect />
          </SettingRow>
        </div>
      {:else if section.id === "basic"}
        <div class="space-y-3">
          <SettingRow
            label="最大步数"
            overridden={modelConfigStore.maxSteps !== null}
            ontoggle={(v) => (modelConfigStore.maxSteps = v ? 30 : null)}
            help="数值越大允许越复杂的任务。"
          >
            {#if modelConfigStore.maxSteps !== null}
              <DebouncedNumberInput
                value={modelConfigStore.maxSteps}
                min={1}
                onchange={(v) => (modelConfigStore.maxSteps = v)}
                class="rounded-xl"
              />
            {/if}
          </SettingRow>

          <SettingRow
            label="流式输出"
            overridden={modelConfigStore.streaming !== null}
            ontoggle={(v) => (modelConfigStore.streaming = v ? true : null)}
            help="仅对根 Agent 生效。"
          >
            {#if modelConfigStore.streaming !== null}
              <div
                class="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2"
              >
                <span class="text-sm">开启流式输出</span>
                <Switch
                  checked={modelConfigStore.streaming}
                  onCheckedChange={(v) => (modelConfigStore.streaming = v)}
                />
              </div>
            {/if}
          </SettingRow>

          <SettingRow
            label="历史消息"
            overridden={modelConfigStore.history !== null}
            ontoggle={(v) => (modelConfigStore.history = v ? -1 : null)}
            help="-1 全部历史 · 0 禁用 · 正整数 = 最近 N 条。"
          >
            {#if modelConfigStore.history !== null}
              <DebouncedNumberInput
                value={modelConfigStore.history}
                min={-1}
                onchange={(v) => (modelConfigStore.history = v)}
                class="rounded-xl"
              />
            {/if}
          </SettingRow>
        </div>
      {:else if section.id === "sampling"}
        <div class="space-y-3">
          <SettingRow
            label="创意度"
            overridden={modelConfigStore.temperature !== null}
            ontoggle={(v) => (modelConfigStore.temperature = v ? 0.7 : null)}
            help="事实问答、代码生成建议 0.0–0.3；日常对话 0.5–0.8；创意写作 0.8 以上。"
          >
            <TemperatureSlider />
          </SettingRow>

          <SettingRow
            label="输出长度上限"
            overridden={modelConfigStore.maxOutputTokens !== null}
            ontoggle={(v) =>
              (modelConfigStore.maxOutputTokens = v ? 8192 : null)}
            help="过小可能导致回答被截断，过大可能增加费用。"
          >
            {#if modelConfigStore.maxOutputTokens !== null}
              <DebouncedNumberInput
                value={modelConfigStore.maxOutputTokens}
                min={1}
                onchange={(v) => (modelConfigStore.maxOutputTokens = v)}
                class="rounded-xl"
              />
            {/if}
          </SettingRow>
        </div>
      {:else if section.id === "tools"}
        <div class="space-y-3">
          <SettingRow
            label="工具调用并发上限"
            overridden={modelConfigStore.toolCallConcurrency !== null}
            ontoggle={(v) =>
              (modelConfigStore.toolCallConcurrency = v ? 4 : null)}
            help="并发过高可能触发 Provider 限流；过低会增加总耗时。"
          >
            {#if modelConfigStore.toolCallConcurrency !== null}
              <DebouncedNumberInput
                value={modelConfigStore.toolCallConcurrency}
                min={1}
                onchange={(v) => (modelConfigStore.toolCallConcurrency = v)}
                class="rounded-xl"
              />
            {/if}
          </SettingRow>

          <SettingRow
            label="严格工具调用"
            overridden={modelConfigStore.strict !== null}
            ontoggle={(v) => (modelConfigStore.strict = v ? true : null)}
            help="并非所有模型/Provider 都支持 strict 模式。"
          >
            {#if modelConfigStore.strict !== null}
              <div
                class="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2"
              >
                <span class="text-sm">启用 strict 模式</span>
                <Switch
                  checked={modelConfigStore.strict}
                  onCheckedChange={(v) => (modelConfigStore.strict = v)}
                />
              </div>
            {/if}
          </SettingRow>

          <SettingRow
            label="总超时"
            overridden={modelConfigStore.timeoutTotalMs !== null}
            ontoggle={(v) =>
              (modelConfigStore.timeoutTotalMs = v ? 120000 : null)}
            help="复杂多步任务可能需要更长。"
          >
            {#if modelConfigStore.timeoutTotalMs !== null}
              <div class="flex items-center gap-2">
                <DebouncedNumberInput
                  value={modelConfigStore.timeoutTotalMs}
                  min={1000}
                  onchange={(v) => (modelConfigStore.timeoutTotalMs = v)}
                  class="rounded-xl"
                />
                <span class="text-sm text-muted-foreground">ms</span>
              </div>
            {/if}
          </SettingRow>
        </div>
      {/if}
    </ModelConfigSection>
  {/each}
</div>
