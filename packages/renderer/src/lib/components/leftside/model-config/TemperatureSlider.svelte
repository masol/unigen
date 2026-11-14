<!-- packages/renderer/src/lib/components/leftside/model-config/TemperatureSlider.svelte -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Slider } from "$lib/components/ui/slider";
  import { modelConfigStore } from "$lib/store/local/model-config.store.svelte";
  import { onDestroy } from "svelte";
  import { temperatureLabel } from "./model-config.types";

  const DEBOUNCE_MS = 250;

  let draft = $state(modelConfigStore.temperature ?? 0.7);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  $effect(() => {
    const temperature = modelConfigStore.temperature;

    if (temperature !== null && !pending && temperature !== draft) {
      draft = temperature;
    }
  });

  function schedule(value: number) {
    draft = value;
    pending = true;

    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
      timer = null;
      pending = false;
      modelConfigStore.temperature = value;
    }, DEBOUNCE_MS);
  }

  onDestroy(() => {
    if (!timer) return;

    clearTimeout(timer);
    timer = null;

    // 因折叠等原因卸载时保留最后一次拖动值；因关闭覆盖而卸载时 temperature 已为 null，不写回。
    if (modelConfigStore.temperature !== null) {
      modelConfigStore.temperature = draft;
    }
  });
</script>

{#if modelConfigStore.temperature !== null}
  <div class="space-y-3">
    <div
      class="flex items-center justify-between text-[11px] text-muted-foreground"
    >
      <span>稳定</span>
      <span>平衡</span>
      <span>创意</span>
    </div>

    <Slider
      type="single"
      value={draft}
      min={0}
      max={2}
      step={0.1}
      onValueChange={(v: number) => schedule(v)}
      class="rounded-xl"
    />

    <div class="flex items-center justify-between">
      <Badge variant="outline" class="rounded-lg font-normal">
        {temperatureLabel(draft)}
      </Badge>
      <span class="text-xs tabular-nums text-muted-foreground">
        {draft.toFixed(1)}
      </span>
    </div>
  </div>
{/if}
