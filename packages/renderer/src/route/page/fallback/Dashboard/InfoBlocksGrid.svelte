<!-- src/lib/components/dashboard/InfoBlocksGrid.svelte -->
<!--
  职责：三宫格信息卡的展示层。
  - 静态内容（图标/标题/摘要/引导）来自外部中立 JSON。
  - 右上角状态由内部 resolveCardStatus(id) 计算，外部无法注入。
  - 点击卡片回调 onOpen(card)，由宿主决定如何打开侧栏。
-->
<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Badge } from "$lib/components/ui/badge";
  import { layoutStore } from "$lib/store/ui/layout.svelte";
  import type { InfoCardView } from "@app/main/types";
  import {
    IconChevronRight,
    IconCircleCheckFilled,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";
  import { resolveCardStatus } from "./card-status.svelte";

  function onOpen(card: InfoCardView) {
    if (!card.activity) {
      toast.warning(`「${card.title}」尚未配置对应面板`);
      return;
    }
    layoutStore.setActiveActivity(card.activity);
    layoutStore.openPanel("left");
  }

  const cards: InfoCardView[] = [
    {
      id: "input-manager",
      icon: "IconBook2",
      title: "输入",
      subtitle: "原始素材",
      summary: "管理任务的原始输入与要求，点击进入查看与编辑。",
      activity: "input-manager",
      hint: "点击进行配置",
    },
    {
      id: "spec-setting",
      icon: "IconSparkles",
      title: "设置",
      subtitle: "任务配置",
      summary: "调整生成规格与常用选项，点击进入详细设置。",
      activity: "spec-setting",
      hint: "点击进行配置",
    },
    {
      id: "output",
      icon: "IconFileTextFilled",
      title: "输出",
      subtitle: "结果导出",
      summary: "查看与导出 AI 处理完成后的结果。",
      activity: "output-manager",
      hint: "点击查看结果",
    },
  ];
</script>

<div class="grid grid-cols-1 gap-6 md:grid-cols-3 animate-fade-in">
  {#each cards as card (card.id)}
    {@const status = resolveCardStatus(card)}
    <button
      type="button"
      id={`ib-${card.id}`}
      onclick={() => onOpen(card)}
      class="group flex flex-col gap-5 rounded-2xl border border-border/50 bg-card p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div class="flex items-start justify-between">
        <div
          class="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
        >
          <RuntimeIcon name={card.icon} size={20} stroke={1.5} />
        </div>

        {#if status}
          <Badge
            variant="outline"
            class={[
              "rounded-lg border-border/50 px-2 py-0.5 text-[10px] font-medium",
              status.tone === "ready"
                ? "text-emerald-600 dark:text-emerald-500"
                : "text-muted-foreground",
            ]}
          >
            {#if status.tone === "ready"}
              <IconCircleCheckFilled size={12} stroke={1.5} class="mr-1" />
            {/if}
            {status.label}
          </Badge>
        {/if}
      </div>

      <div class="space-y-2">
        <div class="flex items-baseline gap-2">
          <h3 class="text-lg font-medium">{card.title}</h3>
          {#if card.subtitle}
            <span class="text-xs text-muted-foreground">{card.subtitle}</span>
          {/if}
        </div>
        {#if card.summary}
          <p class="text-sm leading-relaxed text-foreground">{card.summary}</p>
        {/if}
      </div>

      <div
        class="mt-auto flex items-center justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground"
      >
        <span>{card.hint ?? "点击查看详情"}</span>
        <IconChevronRight
          size={16}
          stroke={1.5}
          class="transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </div>
    </button>
  {/each}
</div>
