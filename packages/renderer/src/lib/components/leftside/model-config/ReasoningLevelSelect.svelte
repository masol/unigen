<!-- model-config/ReasoningLevelSelect.svelte -->
<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  import { modelConfigStore } from "$lib/store/local/model-config.store.svelte";
  import type { ReasoningLevel } from "@app/main/types";
  import { REASONING_LABELS } from "./model-config.types";

  const options = Object.entries(REASONING_LABELS) as [
    ReasoningLevel,
    string,
  ][];
</script>

<Select.Root
  type="single"
  value={modelConfigStore.reasoning ?? "provider-default"}
  onValueChange={(v) => (modelConfigStore.reasoning = v as ReasoningLevel)}
>
  <Select.Trigger class="w-full rounded-xl">
    {REASONING_LABELS[modelConfigStore.reasoning ?? "provider-default"]}
  </Select.Trigger>
  <Select.Content class="rounded-xl">
    {#each options as [level, label] (level)}
      <Select.Item value={level}>{label}</Select.Item>
    {/each}
  </Select.Content>
</Select.Root>
