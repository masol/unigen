<!-- NovelToVideoDashboard/InfoBlocksGrid.svelte -->
<!-- 职责：三宫格信息卡（输入 / 要求 / 输出）入口。各卡片独立维护内容。 -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import {
    IconChevronRight,
    IconCircleCheckFilled,
    IconBook2,
    IconSparkles,
    IconVideo,
  } from "@tabler/icons-svelte";

  // @TODO: 纳入插件体系。
  import { specStore } from "../../../../plugins/video/mainsrv/leftbar/spec-setting/spec.svelte";
  import { inputStore } from "../../../../plugins/video/mainsrv/leftbar/input-manager/input.svelte";

  import { onMount } from "svelte";
  import { formatTokens } from "../../settings/llm/types";
  import { layoutStore } from "$lib/store/ui/layout.svelte";

  let totalSize = $derived.by(() => {
    return inputStore.scripts.reduce((acc, item) => {
      return acc + item.size;
    }, 0);
  });
  let inputSummary = $derived.by(() => {
    return `《${inputStore.bookName ?? "未命名"}》· ${inputStore.scripts.length} 次 · ${formatTokens(totalSize)}字`;
  });
  let inputStatus = $derived.by(() => {
    return totalSize > 0 ? "已就绪" : "待输入";
  });
  let inputTone = $derived.by<"ready" | "pending">(() => {
    return totalSize > 0 ? "ready" : "pending";
  });
  let specStatus = $state("可用");
  let specTone = $state<"ready" | "pending">("ready");

  let outputSummary = $state("MP4 · 1080×1920 · H.264 · 本地 + 阿里云 OSS");
  let outputStatus = $state("待生成");
  let outputTone = $state<"ready" | "pending">("pending");

  // 配置处理函数
  function handleInputConfig() {
    layoutStore.setActiveActivity("input-manager");
    layoutStore.openPanel("left");
  }

  function handleSpecConfig() {
    layoutStore.setActiveActivity("spec-setting");
    layoutStore.openPanel("left");
  }

  function handleOutputConfig() {
    // dashboardStore.openPanel("output");
  }

  onMount(() => {
    specStore.init();
    inputStore.init();
  });
</script>

<div class="grid grid-cols-1 gap-6 md:grid-cols-3 animate-fade-in">
  <!-- 输入卡片 -->
  <button
    type="button"
    id="ib-input-manager"
    onclick={handleInputConfig}
    class="group flex flex-col gap-5 rounded-2xl border border-border/50 bg-card p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <div class="flex items-start justify-between">
      <div
        class="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
      >
        <IconBook2 size={20} stroke={1.5} />
      </div>
      <Badge
        variant="outline"
        class={[
          "rounded-lg border-border/50 px-2 py-0.5 text-[10px] font-medium",
          inputTone === "ready"
            ? "text-emerald-600 dark:text-emerald-500"
            : "text-muted-foreground",
        ]}
      >
        {#if inputTone === "ready"}
          <IconCircleCheckFilled size={12} stroke={1.5} class="mr-1" />
        {/if}
        {inputStatus}
      </Badge>
    </div>

    <div class="space-y-2">
      <div class="flex items-baseline gap-2">
        <h3 class="text-lg font-medium">输入</h3>
        <span class="text-xs text-muted-foreground">剧本</span>
      </div>
      <p class="text-sm leading-relaxed text-foreground">
        {inputSummary}
      </p>
    </div>

    <div
      class="mt-auto flex items-center justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground"
    >
      <span>点击进行配置</span>
      <IconChevronRight
        size={16}
        stroke={1.5}
        class="transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </div>
  </button>

  <!-- 说明要求卡片 -->
  <button
    type="button"
    onclick={handleSpecConfig}
    class="group flex flex-col gap-5 rounded-2xl border border-border/50 bg-card p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <div class="flex items-start justify-between">
      <div
        class="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
      >
        <IconSparkles size={20} stroke={1.5} />
      </div>
      <Badge
        variant="outline"
        class={[
          "rounded-lg border-border/50 px-2 py-0.5 text-[10px] font-medium",
          specTone === "ready"
            ? "text-emerald-600 dark:text-emerald-500"
            : "text-muted-foreground",
        ]}
      >
        {#if specTone === "ready"}
          <IconCircleCheckFilled size={12} stroke={1.5} class="mr-1" />
        {/if}
        {specStatus}
      </Badge>
    </div>

    <div class="space-y-2">
      <div class="flex items-baseline gap-2">
        <h3 class="text-lg font-medium">设置</h3>
        <span class="text-xs text-muted-foreground">生成规格</span>
      </div>
      <p class="text-sm leading-relaxed text-foreground">
        {specStore.specSummary}
      </p>
    </div>

    <div
      class="mt-auto flex items-center justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground"
    >
      <span>点击进行配置</span>
      <IconChevronRight
        size={16}
        stroke={1.5}
        class="transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </div>
  </button>

  <!-- 输出卡片 -->
  <button
    type="button"
    onclick={handleOutputConfig}
    class="group flex flex-col gap-5 rounded-2xl border border-border/50 bg-card p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <div class="flex items-start justify-between">
      <div
        class="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
      >
        <IconVideo size={20} stroke={1.5} />
      </div>
      <Badge
        variant="outline"
        class={[
          "rounded-lg border-border/50 px-2 py-0.5 text-[10px] font-medium",
          outputTone === "ready"
            ? "text-emerald-600 dark:text-emerald-500"
            : "text-muted-foreground",
        ]}
      >
        {#if outputTone === "ready"}
          <IconCircleCheckFilled size={12} stroke={1.5} class="mr-1" />
        {/if}
        {outputStatus}
      </Badge>
    </div>

    <div class="space-y-2">
      <div class="flex items-baseline gap-2">
        <h3 class="text-lg font-medium">输出</h3>
        <span class="text-xs text-muted-foreground">导出目标</span>
      </div>
      <p class="text-sm leading-relaxed text-foreground">
        {outputSummary}
      </p>
    </div>

    <div
      class="mt-auto flex items-center justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground"
    >
      <span>点击进行配置</span>
      <IconChevronRight
        size={16}
        stroke={1.5}
        class="transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </div>
  </button>
</div>
