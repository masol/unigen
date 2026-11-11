<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { Step } from "$lib/components/ui/walkthrough/ctx";
  import { configStore } from "$lib/store/config.svelte";
  import { IconInfoCircle } from "@tabler/icons-svelte";

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
      title: "设置模型",
      description: "在【搜索配置】章节设置模型。",
      position: "top",
    },
    {
      target: "headerbar-goHome",
      title: "回到工作台",
      description: "任意时刻点击这里，可以回到工作台。",
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

  async function handleSetEmbedModel() {
    tourStore.start(steps, tour2Next);
  }
</script>

{#if !configStore.embedModel}
  <div class="flex items-center gap-1.5 px-1 text-xs text-muted-foreground/60">
    <IconInfoCircle class="size-3.5" />
    <span>未设置默认的嵌入模型，知识库功能被禁用。</span>
    <Button
      size="xs"
      variant="outline"
      class="h-4! min-h-0! px-1! py-0! text-[10px]! leading-none"
      onclick={handleSetEmbedModel}
    >
      设置教程
    </Button>
  </div>
{/if}

{#if !configStore.localModel}
  <div class="flex items-center gap-1.5 px-1 text-xs text-muted-foreground/60">
    <IconInfoCircle class="size-3.5" />
    <span>未设置重排模型，这会降低召回的正确度。</span>
    <Button
      size="xs"
      variant="outline"
      class="h-4! min-h-0! px-1! py-0! text-[10px]! leading-none"
      onclick={handleSetEmbedModel}
    >
      设置教程
    </Button>
  </div>
{/if}
