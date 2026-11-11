<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { Step } from "$lib/components/ui/walkthrough/ctx";
  import { layoutStore } from "$lib/store/ui/layout.svelte";
  import { tourStore } from "$lib/store/ui/tour.svelte";
  import { delay } from "$lib/utils/promise";
  import {
    IconAdjustments,
    IconArrowRight,
    IconClipboardText,
    IconPlugConnected,
  } from "@tabler/icons-svelte";
  import { push } from "svelte-spa-router";

  const SettingId = "settings";
  const steps: Step[] = [
    {
      target: "botactivity-settings",
      title: "点击设置",
      description: "打开设置侧边栏",
      position: "right",
    },
    {
      target: "settings-models-all",
      title: "点击AIGC",
      description: "打开生成式模型设置界面",
      position: "bottom",
    },
    {
      target: "settings-aigc-details",
      title: "AIGC设置页",
      description: "在设置页面中添加你的供应商，并启用对应模型。",
      position: "left",
    },
    {
      target: "headerbar-goHome",
      title: "回到工作台",
      description: "任意时刻点击这里，可以回到工作台。",
      position: "bottom",
    },
  ];

  async function tourNext(curId: number) {
    if (curId === 0) {
      // 打开设置。
      if (layoutStore.activeActivity !== SettingId || !layoutStore.isLeftOpen) {
        layoutStore.handleActivityClick(SettingId);
        await delay(100);
      }
    } else if (curId === 1) {
      push("/settings/models/llm");
      await delay(100);
      const el = document.getElementById("settings-aigc-details");
      // const container = document.querySelector("[data-scroll-area-viewport]");

      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
        });
        await delay(100);
      }
    }
  }

  async function handleStart() {
    tourStore.start(steps, tourNext);
  }

  const highlights = [
    {
      icon: IconClipboardText,
      title: "像给同事交代任务那样，告诉 AI 怎么做",
      desc: "无需编程背景。把一件事该怎么做写下来并保存，就得到一个专注于此的 Agent。有向人交代工作的经验，通常就能上手。",
    },
    {
      icon: IconAdjustments,
      title: "像带新人那样，指出哪一步不对",
      desc: "哪里做得不对，直接改指南里对应的那一步，下次它会按新的做。某一步过于笼统时，可单独写成子指南，由独立的 sub-agent 完成。",
    },
    {
      icon: IconPlugConnected,
      title: "兼容现有 Agent 生态",
      desc: "常见的对话式工具与各类智能体，大致可视为预设工作指南的Unigen项目。内置几份开箱即用的预设，并兼容 skill 与 MCP生态。",
    },
  ];
</script>

<section
  class="flex animate-fade-in flex-col gap-10 pt-6"
  aria-label="配置引导"
>
  <div class="flex flex-col items-center gap-6">
    <div class="space-y-2 text-center">
      <h2 class="text-2xl font-semibold tracking-tight text-foreground">
        配置文本模型以开始
      </h2>
      <p class="text-sm text-muted-foreground">
        需要至少启用一个大语言模型才能使用本应用，完成后自动解锁。
      </p>
    </div>
    <Button class="rounded-xl" onclick={handleStart}>
      开始设置教程
      <IconArrowRight size={20} stroke={1.5} class="ml-2" />
    </Button>
  </div>

  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [可抽取子组件 → ProductHighlights.svelte]            │ -->
  <!-- │职责：以三条要点介绍产品定位，帮助新手理解 Unigen 是什么│ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <div class="space-y-4">
    <p class="text-xs text-muted-foreground">关于 Unigen</p>
    <div class="flex flex-col gap-4">
      {#each highlights as item (item.title)}
        {@const Icon = item.icon}
        <div
          class="flex gap-4 rounded-2xl border border-border/50 bg-card p-6 shadow-sm"
        >
          <Icon
            size={20}
            stroke={1.5}
            class="mt-0.5 shrink-0 text-muted-foreground"
          />
          <div class="space-y-1.5">
            <p class="text-sm font-medium text-foreground">{item.title}</p>
            <p class="text-xs leading-relaxed text-muted-foreground">
              {item.desc}
            </p>
          </div>
        </div>
      {/each}
    </div>
  </div>
  <!-- ╭─── / ProductHighlights ───╮ -->
</section>
