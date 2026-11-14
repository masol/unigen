<!-- packages/renderer/src/lib/components/leftside/model-config/ModelSelector.svelte -->
<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  import { configStore } from "$lib/store/config.svelte";
  import { modelConfigStore } from "$lib/store/local/model-config.store.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import { prettyModel } from "./model-config.types";
</script>

<div class="space-y-4" use:autoAnimate>
  {#each modelConfigStore.requireModelEntries as entry (entry)}
    <div class="space-y-2">
      <span class="block truncate text-xs font-medium" title={entry}>
        {entry}
      </span>

      <Select.Root
        type="single"
        value={modelConfigStore.userSelModelMap[entry] ?? ""}
        onValueChange={(v) => {
          if (v) modelConfigStore.userSelModelMap[entry] = v;
          else delete modelConfigStore.userSelModelMap[entry];
        }}
      >
        <Select.Trigger class="w-full rounded-xl">
          {modelConfigStore.userSelModelMap[entry]
            ? prettyModel(modelConfigStore.userSelModelMap[entry])
            : "自动（不覆盖）"}
        </Select.Trigger>
        <Select.Content class="rounded-xl">
          <Select.Item value="">自动（不覆盖）</Select.Item>
          {#each configStore.llmModels as model (model)}
            <Select.Item value={model}>{prettyModel(model)}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  {/each}

  <div class="space-y-2">
    <span class="block truncate text-xs font-medium" title="默认"> 默认 </span>

    <Select.Root
      type="single"
      value={modelConfigStore.userSelModelDefault}
      onValueChange={(v) => (modelConfigStore.userSelModelDefault = v)}
    >
      <Select.Trigger class="w-full rounded-xl">
        {modelConfigStore.userSelModelDefault
          ? prettyModel(modelConfigStore.userSelModelDefault)
          : "请选择默认模型…"}
      </Select.Trigger>
      <Select.Content class="rounded-xl">
        {#each configStore.llmModels as model (model)}
          <Select.Item value={model}>{prettyModel(model)}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  {#if configStore.llmModels.length === 0}
    <p class="text-xs text-muted-foreground">
      当前没有可用的文本生成模型，请先在「AIGC 模型」中配置。
    </p>
  {/if}
</div>
