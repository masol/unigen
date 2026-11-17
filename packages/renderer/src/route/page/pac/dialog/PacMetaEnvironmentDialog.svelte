<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { PacFrontMatter } from "@app/main/types";

  import {
    buildBooleanPatch,
    buildJsonPatch,
    buildNumberPatch,
    buildStringPatch,
    parseJson,
    readBoolean,
    readJsonText,
    readNumberText,
    readString,
    type PacMetaDialogCommonProps,
  } from "./pac-meta-dialog-utils";

  const REASONING_OPTIONS = [
    "provider-default",
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ] as const;

  type ReasoningOption = (typeof REASONING_OPTIONS)[number];

  let { value, onClose, onCancel }: PacMetaDialogCommonProps = $props();

  let requireModel = $state(readString(value, "requireModel"));
  let modelText = $state(
    typeof value.model === "string"
      ? value.model
      : readJsonText(value, "model"),
  );
  let maxSteps = $state(readNumberText(value, "maxSteps"));
  let streaming = $state(readBoolean(value, "streaming", true));
  let reasoning = $state<ReasoningOption>(
    (REASONING_OPTIONS as readonly string[]).includes(value.reasoning as string)
      ? (value.reasoning as ReasoningOption)
      : "provider-default",
  );
  let persist = $state(readBoolean(value, "persist", true));
  let historyMode = $state<"unset" | "null" | "number">(
    value.history === null
      ? "null"
      : typeof value.history === "number"
        ? "number"
        : "unset",
  );
  let historyValue = $state(
    typeof value.history === "number" ? String(value.history) : "",
  );
  let timeoutText = $state(readJsonText(value, "timeout"));
  let temperature = $state(readNumberText(value, "temperature"));
  let maxOutputTokens = $state(readNumberText(value, "maxOutputTokens"));
  let toolCallConcurrency = $state(
    readNumberText(value, "toolCallConcurrency"),
  );
  let strictMode = $state<"unset" | "true" | "false">(
    typeof value.strict === "boolean"
      ? value.strict
        ? "true"
        : "false"
      : "unset",
  );
  let error = $state<string | null>(null);

  function buildModelPatch(): string | Record<string, unknown> | undefined {
    const trimmed = modelText.trim();
    if (!trimmed) return undefined;

    const parsed = parseJson(trimmed);
    if (
      parsed.ok &&
      typeof parsed.value === "object" &&
      parsed.value !== null &&
      !Array.isArray(parsed.value)
    ) {
      return parsed.value as Record<string, unknown>;
    }

    return trimmed;
  }

  function save() {
    error = null;

    const parsedTimeout = parseJson(timeoutText);
    if (!parsedTimeout.ok) {
      error = `超时配置 JSON 解析失败：${parsedTimeout.error}`;
      return;
    }

    if (
      parsedTimeout.value !== undefined &&
      !(
        typeof parsedTimeout.value === "number" ||
        (typeof parsedTimeout.value === "object" &&
          parsedTimeout.value !== null &&
          !Array.isArray(parsedTimeout.value))
      )
    ) {
      error = "超时配置必须是数字或对象。";
      return;
    }

    const numberFields: { label: string; text: string }[] = [
      { label: "最大步数 maxSteps", text: maxSteps },
      { label: "采样温度 temperature", text: temperature },
      { label: "输出 token 上限 maxOutputTokens", text: maxOutputTokens },
      { label: "工具并发上限 toolCallConcurrency", text: toolCallConcurrency },
    ];

    for (const field of numberFields) {
      const trimmed = field.text.trim();
      if (trimmed && !Number.isFinite(Number(trimmed))) {
        error = `${field.label} 必须是数字。`;
        return;
      }
    }

    if (
      historyMode === "number" &&
      historyValue.trim() &&
      !Number.isFinite(Number(historyValue))
    ) {
      error = "历史条数必须是数字。";
      return;
    }

    const history: number | null | undefined =
      historyMode === "null"
        ? null
        : historyMode === "number"
          ? buildNumberPatch(value.history, historyValue)
          : undefined;

    const patch: Partial<PacFrontMatter> = {
      requireModel: buildStringPatch(value.requireModel, requireModel),
      model: buildModelPatch(),
      maxSteps: buildNumberPatch(value.maxSteps, maxSteps),
      streaming: buildBooleanPatch(value.streaming, streaming, true),
      reasoning,
      persist: buildBooleanPatch(value.persist, persist, true),
      history,
      timeout: buildJsonPatch(value.timeout, parsedTimeout.value) as
        | PacFrontMatter["timeout"]
        | undefined,
      temperature: buildNumberPatch(value.temperature, temperature),
      maxOutputTokens: buildNumberPatch(value.maxOutputTokens, maxOutputTokens),
      toolCallConcurrency: buildNumberPatch(
        value.toolCallConcurrency,
        toolCallConcurrency,
      ),
      strict: strictMode === "unset" ? undefined : strictMode === "true",
    };

    onClose?.(patch);
  }
</script>

<div class="space-y-6 p-6">
  <div class="space-y-2">
    <h2 class="text-lg font-medium">环境</h2>
    <p class="text-sm text-muted-foreground">
      定义 Agent
      运行环境：期望模型、推理深度、步数、流式、持久化、历史、超时与采样参数等。
    </p>
  </div>

  <div class="grid gap-4 md:grid-cols-2">
    <label class="block space-y-2">
      <span class="text-xs font-medium text-muted-foreground">
        期望模型 requireModel
      </span>
      <input
        class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        bind:value={requireModel}
        placeholder="例如：fast"
      />
    </label>

    <label class="block space-y-2">
      <span class="text-xs font-medium text-muted-foreground">
        模型选择 model（字符串或 JSON 对象）
      </span>
      <input
        class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
        bind:value={modelText}
        placeholder="openai::gpt-4.1-mini 或 "
      />
    </label>
  </div>

  <div class="grid gap-4 md:grid-cols-3">
    <label class="block space-y-2">
      <span class="text-xs font-medium text-muted-foreground"
        >最大步数 maxSteps</span
      >
      <input
        type="number"
        min="1"
        class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        bind:value={maxSteps}
        placeholder="30"
      />
    </label>

    <label class="block space-y-2">
      <span class="text-xs font-medium text-muted-foreground"
        >采样温度 temperature</span
      >
      <input
        type="number"
        step="0.1"
        min="0"
        class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        bind:value={temperature}
        placeholder="0 ~ 2"
      />
    </label>

    <label class="block space-y-2">
      <span class="text-xs font-medium text-muted-foreground">
        输出 token 上限 maxOutputTokens
      </span>
      <input
        type="number"
        min="1"
        class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        bind:value={maxOutputTokens}
        placeholder="例如：4096"
      />
    </label>
  </div>

  <div class="grid gap-4 md:grid-cols-2">
    <label class="block space-y-2">
      <span class="text-xs font-medium text-muted-foreground"
        >推理级别 reasoning</span
      >
      <select
        class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        bind:value={reasoning}
      >
        {#each REASONING_OPTIONS as option (option)}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </label>

    <label class="block space-y-2">
      <span class="text-xs font-medium text-muted-foreground">
        工具并发上限 toolCallConcurrency
      </span>
      <input
        type="number"
        min="1"
        class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        bind:value={toolCallConcurrency}
        placeholder="留空由 SDK 决定"
      />
    </label>
  </div>

  <div class="grid gap-4 md:grid-cols-3">
    <label
      class="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2"
    >
      <span class="text-xs font-medium text-muted-foreground"
        >流式 streaming</span
      >
      <input type="checkbox" bind:checked={streaming} />
    </label>

    <label
      class="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2"
    >
      <span class="text-xs font-medium text-muted-foreground"
        >持久化 persist</span
      >
      <input type="checkbox" bind:checked={persist} />
    </label>

    <label class="block space-y-2">
      <span class="text-xs font-medium text-muted-foreground"
        >strict tool calling</span
      >
      <select
        class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        bind:value={strictMode}
      >
        <option value="unset">未设置</option>
        <option value="true">开启</option>
        <option value="false">关闭</option>
      </select>
    </label>
  </div>

  <div class="grid gap-4 md:grid-cols-2">
    <label class="block space-y-2">
      <span class="text-xs font-medium text-muted-foreground"
        >历史策略 history</span
      >
      <select
        class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        bind:value={historyMode}
      >
        <option value="unset">未设置（默认全部）</option>
        <option value="null">全部历史</option>
        <option value="number">最近 N 条</option>
      </select>
    </label>

    {#if historyMode === "number"}
      <label class="block space-y-2">
        <span class="text-xs font-medium text-muted-foreground">历史条数 N</span
        >
        <input
          type="number"
          min="0"
          class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          bind:value={historyValue}
          placeholder="0 表示禁用历史"
        />
      </label>
    {/if}
  </div>

  <label class="block space-y-2">
    <span class="text-xs font-medium text-muted-foreground">
      超时配置 timeout（数字毫秒或 JSON 对象）
    </span>
    <textarea
      class="min-h-24 w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
      bind:value={timeoutText}
      placeholder={`10000 或 { "totalMs": 10000, "stepMs": 3000 }`}></textarea>
  </label>

  {#if error}
    <p class="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {error}
    </p>
  {/if}

  <div class="flex justify-end gap-3">
    <Button variant="outline" class="rounded-xl" onclick={() => onCancel?.()}>
      取消
    </Button>
    <Button class="rounded-xl" onclick={save}>保存</Button>
  </div>
</div>
