<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { Step } from "$lib/components/ui/walkthrough/ctx";
  import { configStore } from "$lib/store/config.svelte";
  import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-svelte";

  import { layoutStore } from "$lib/store/ui/layout.svelte";
  import { tourStore } from "$lib/store/ui/tour.svelte";
  import { delay } from "$lib/utils/promise";
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
      target: "settings-general-main",
      title: "点击通用",
      description: "打开通用设置界面",
      position: "bottom",
    },
    {
      target: "settings-check-embeding",
      title: "本地嵌入模型",
      description: "在设置页面中的模型设置章节设置嵌入模型。",
      position: "top",
    },
    {
      target: "headerbar-goHome",
      title: "回到控制台",
      description: "任意时刻点击这里，可以回到控制台。",
      position: "bottom",
    },
  ];

  async function tour2Next(curId: number) {
    if (curId === 0) {
      // 打开设置。
      if (layoutStore.activeActivity !== SettingId || !layoutStore.isLeftOpen) {
        layoutStore.handleActivityClick(SettingId);
        await delay(100);
      }
    } else if (curId === 1) {
      push("/settings/general");
      await delay(100);
      const el = document.getElementById("settings-check-embeding");
      // const container = document.querySelector("[data-scroll-area-viewport]");

      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
        });
        await delay(100);
      }
    }
  }

  const steps0: Step[] = [
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
      title: "回到控制台",
      description: "任意时刻点击这里，可以回到控制台。",
      position: "bottom",
    },
  ];

  async function tour2Aigc(curId: number) {
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

  async function handleSetEmbedModel() {
    tourStore.start(steps, tour2Next);
  }

  async function handleSetLLM() {
    tourStore.start(steps0, tour2Aigc);
  }
</script>

{#if configStore.llmModelCount === 0}
  <div
    role="alert"
    class="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3"
  >
    <IconAlertTriangle
      class="size-5 shrink-0 text-amber-600 dark:text-amber-400"
    />
    <div class="flex-1 text-sm">
      <span class="font-medium text-amber-700 dark:text-amber-300">
        未启用任意语言模型
      </span>
      <span class="text-amber-700/80 dark:text-amber-300/80">
        ，请检查是否启用至少一个大语言模型。
      </span>
    </div>
    <Button size="sm" variant="outline" onclick={handleSetLLM}>设置教程</Button>
  </div>
{/if}

{#if !configStore.embedModel}
  <div class="flex items-center gap-1.5 px-1 text-xs text-muted-foreground/60">
    <IconInfoCircle class="size-3.5" />
    <span>未设置默认的嵌入模型，知识库功能被禁用。</span>
    <Button size="xs" variant="outline" onclick={handleSetEmbedModel}>
      设置教程
    </Button>
  </div>
  <!-- 
  {#if !configStore.localModel}
    <div
      class="flex items-center gap-1.5 px-1 text-xs text-muted-foreground/60"
    >
      <IconInfoCircle class="size-3.5" />
      <span>未设置重排模型，这会降低知识库召回的正确度。</span>
      <Button size="sm" variant="outline" onclick={handleSetEmbedModel}>
        设置教程
      </Button>
    </div>
  {/if} -->
{/if}
