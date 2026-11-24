<!-- packages/renderer/src/lib/store/local/sess/auto-completion.dialog.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import { Switch } from "$lib/components/ui/switch";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import { IconBolt } from "@tabler/icons-svelte";
  import {
    normalizeCompletionConfig,
    type AutoCompletionStrategy,
    type AutoTaskConfig,
  } from "./session.types";

  type Props = {
    initialConfig?: AutoTaskConfig;
  } & DialogComponentProps<AutoTaskConfig>;

  let { initialConfig = {}, onClose, onCancel }: Props = $props();

  const initialCompletion = normalizeCompletionConfig(initialConfig.completion);

  let enabled = $state(initialCompletion.enabled);
  let strategy = $state<AutoCompletionStrategy>(initialCompletion.strategy);
  let maxRounds = $state(initialCompletion.maxRounds);
  let activePrompt = $state(initialCompletion.activePrompt);
  let passiveProbePrompt = $state(initialCompletion.passiveProbePrompt);
  let passiveCompletionMarker = $state(
    initialCompletion.passiveCompletionMarker,
  );

  let errorMessage = $state("");

  function handleSave() {
    const rounds = Math.floor(Number(maxRounds));
    if (!Number.isFinite(rounds) || rounds < 1) {
      errorMessage = "最多补全轮次必须是 ≥ 1 的整数";
      return;
    }
    if (!activePrompt.trim()) {
      errorMessage = "主动探测提示语不能为空";
      return;
    }
    if (!passiveProbePrompt.trim()) {
      errorMessage = "被动探测提示语不能为空";
      return;
    }
    if (!passiveCompletionMarker.trim()) {
      errorMessage = "完成标记不能为空";
      return;
    }
    errorMessage = "";

    onClose({
      ...initialConfig,
      completion: {
        enabled,
        strategy,
        maxRounds: rounds,
        activePrompt: activePrompt.trim(),
        passiveProbePrompt: passiveProbePrompt.trim(),
        passiveCompletionMarker: passiveCompletionMarker.trim(),
      },
    });
  }
</script>

<div class="space-y-6 p-6">
  <div class="space-y-1">
    <h2 class="text-lg font-medium">自动续写</h2>
    <p class="text-sm text-muted-foreground">
      AI 输出被截断时自动让模型继续，直到内容完整
    </p>
  </div>

  <!-- 启用开关 -->
  <div
    class="flex items-start justify-between gap-4 rounded-2xl border border-border/50 bg-card p-4"
  >
    <div class="flex items-start gap-3">
      <div
        class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
      >
        <IconBolt class="size-4" stroke={1.5} />
      </div>
      <div class="space-y-0.5">
        <p class="text-sm font-medium">启用自动续写</p>
        <p class="text-xs text-muted-foreground">
          关闭后仅保留配置，不影响正常对话
        </p>
      </div>
    </div>
    <Switch bind:checked={enabled} />
  </div>

  {#if enabled}
    <div class="space-y-6 animate-fade-in">
      <!-- 探测策略 -->
      <div class="space-y-3">
        <p class="text-xs font-medium text-muted-foreground">探测策略</p>
        <RadioGroup.Root
          value={strategy}
          onValueChange={(v) => (strategy = v as AutoCompletionStrategy)}
          class="space-y-2"
        >
          <div class="flex items-start gap-2">
            <RadioGroup.Item
              value="passive"
              id="strategy-passive"
              class="mt-0.5"
            />
            <Label for="strategy-passive" class="cursor-pointer space-y-0.5">
              <p class="text-sm">被动探测</p>
              <p class="text-xs font-normal text-muted-foreground">
                发送探测提示，检测回复中的完成标记
              </p>
            </Label>
          </div>
          <div class="flex items-start gap-2">
            <RadioGroup.Item
              value="active"
              id="strategy-active"
              class="mt-0.5"
            />
            <Label for="strategy-active" class="cursor-pointer space-y-0.5">
              <p class="text-sm">主动探测</p>
              <p class="text-xs font-normal text-muted-foreground">
                检测到思考与正文一致时，主动催促模型继续
              </p>
            </Label>
          </div>
        </RadioGroup.Root>
      </div>

      <!-- 策略专属配置 -->
      {#if strategy === "active"}
        <div class="space-y-2">
          <Label for="active-prompt">催促提示语</Label>
          <textarea
            id="active-prompt"
            bind:value={activePrompt}
            rows={3}
            class="w-full resize-y rounded-xl border border-border/50 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
          ></textarea>
          <p class="text-xs text-muted-foreground">
            思考与正文一致时发送，催促模型继续输出
          </p>
        </div>
      {:else}
        <div class="space-y-2">
          <Label for="passive-probe">探测提示语</Label>
          <textarea
            id="passive-probe"
            bind:value={passiveProbePrompt}
            rows={4}
            class="w-full resize-y rounded-xl border border-border/50 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
          ></textarea>
          <p class="text-xs text-muted-foreground">
            发送给模型，让其在内容完整时输出完成标记
          </p>
        </div>
        <div class="space-y-2">
          <Label for="passive-marker">完成标记</Label>
          <Input
            id="passive-marker"
            bind:value={passiveCompletionMarker}
            placeholder="[END_OF_RESPONSE]"
            class="rounded-xl font-mono"
          />
          <p class="text-xs text-muted-foreground">
            正文中出现该标记时视为输出完整；建议与提示语中的标记保持一致
          </p>
        </div>
      {/if}

      <!-- 通用：最多轮次 -->
      <div class="space-y-2">
        <Label for="max-rounds">最多补全轮次</Label>
        <Input
          id="max-rounds"
          type="number"
          min={1}
          max={100}
          bind:value={maxRounds}
          class="rounded-xl"
        />
        <p class="text-xs text-muted-foreground">
          达到该轮次后停止自动补全，避免死循环
        </p>
      </div>
    </div>
  {/if}

  {#if errorMessage}
    <p class="text-xs text-destructive">{errorMessage}</p>
  {/if}

  <div class="flex justify-end gap-2 pt-2">
    <Button variant="outline" class="rounded-xl" onclick={() => onCancel()}>
      取消
    </Button>
    <Button class="rounded-xl" onclick={handleSave}>保存</Button>
  </div>
</div>
