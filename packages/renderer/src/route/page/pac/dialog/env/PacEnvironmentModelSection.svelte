<script lang="ts">
  import FieldShell from "./PacEnvironmentField.svelte";
  import {
    REASONING_OPTIONS,
    type ReasoningOption,
  } from "./pac-environment-types";

  let {
    requireModel = $bindable(""),
    maxSteps = $bindable(""),
    temperature = $bindable(""),
    maxOutputTokens = $bindable(""),
    reasoning = $bindable("provider-default" as ReasoningOption),
    toolCallConcurrency = $bindable(""),
  }: {
    requireModel?: string;
    maxSteps?: string;
    temperature?: string;
    maxOutputTokens?: string;
    reasoning?: ReasoningOption;
    toolCallConcurrency?: string;
  } = $props();

  const inputClass =
    "w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";
</script>

<div class="space-y-4">
  <FieldShell
    label="期望模型"
    hint="任意字符串；运行时收集并展示给用户，用于选择或自动匹配模型。留空使用默认值。"
  >
    <input
      class={inputClass}
      bind:value={requireModel}
      placeholder="例如：fast、支持视觉、低延迟"
    />
  </FieldShell>

  <div class="grid gap-4 md:grid-cols-3">
    <FieldShell label="最大步数">
      <input
        type="number"
        min="1"
        class={inputClass}
        bind:value={maxSteps}
        placeholder="默认 30"
      />
    </FieldShell>

    <FieldShell label="采样温度">
      <input
        type="number"
        step="0.1"
        min="0"
        class={inputClass}
        bind:value={temperature}
        placeholder="0 ~ 2"
      />
    </FieldShell>

    <FieldShell label="输出 token 上限">
      <input
        type="number"
        min="1"
        class={inputClass}
        bind:value={maxOutputTokens}
        placeholder="例如：4096"
      />
    </FieldShell>
  </div>

  <div class="grid gap-4 md:grid-cols-2">
    <FieldShell
      label="推理级别"
      hint="自动表示使用 Provider 默认推理级别。"
    >
      <select class={inputClass} bind:value={reasoning}>
        {#each REASONING_OPTIONS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </FieldShell>

    <FieldShell
      label="工具并发上限"
      hint="留空由 SDK 决定。"
    >
      <input
        type="number"
        min="1"
        class={inputClass}
        bind:value={toolCallConcurrency}
        placeholder="留空由 SDK 决定"
      />
    </FieldShell>
  </div>
</div>
