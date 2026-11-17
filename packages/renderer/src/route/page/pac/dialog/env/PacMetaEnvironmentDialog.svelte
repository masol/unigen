<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { onMount } from "svelte";

  import type { PacMetaDialogCommonProps } from "../pac-meta-dialog-utils";
  import PacEnvironmentHistorySection from "./PacEnvironmentHistorySection.svelte";
  import PacEnvironmentModelSection from "./PacEnvironmentModelSection.svelte";
  import PacEnvironmentRuntimeSection from "./PacEnvironmentRuntimeSection.svelte";
  import {
    buildEnvironmentPatch,
    createInitialEnvironmentForm,
    hasEnvironmentChanges,
  } from "./pac-environment-utils";

  let { value, onClose, onCancel }: PacMetaDialogCommonProps = $props();

  const initial = createInitialEnvironmentForm(value);
  let form = $state({ ...initial });
  let error = $state<string | null>(null);

  let hasChanges = $derived(hasEnvironmentChanges(initial, form));

  function save() {
    const result = buildEnvironmentPatch(initial, value, form);
    if (!result.ok) {
      error = result.error;
      return;
    }

    if (Object.keys(result.patch).length === 0) {
      error = "未检测到可保存的变更，请确认修改后重试。";
      return;
    }

    error = null;
    onClose?.(result.patch);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      onCancel?.();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && hasChanges) {
      save();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  });
</script>

<div class="space-y-6 p-6">
  <header class="space-y-2">
    <h2 class="text-lg font-medium">环境</h2>
    <p class="text-sm text-muted-foreground">
      这里定义 Agent 期望的运行环境；实际运行环境可能不同。
    </p>
  </header>

  <PacEnvironmentModelSection
    bind:requireModel={form.requireModel}
    bind:maxSteps={form.maxSteps}
    bind:temperature={form.temperature}
    bind:maxOutputTokens={form.maxOutputTokens}
    bind:reasoning={form.reasoning}
    bind:toolCallConcurrency={form.toolCallConcurrency}
  />

  <PacEnvironmentRuntimeSection
    bind:streaming={form.streaming}
    bind:persist={form.persist}
    bind:strict={form.strict}
  />

  <PacEnvironmentHistorySection bind:historyText={form.historyText} />

  {#if error}
    <p class="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {error}
    </p>
  {/if}

  <div class="flex justify-end gap-3">
    <Button variant="outline" class="rounded-xl" onclick={() => onCancel?.()}>
      取消
    </Button>
    <Button class="rounded-xl" disabled={!hasChanges} onclick={save}
      >保存</Button
    >
  </div>
</div>
