<!-- NovelToVideoDashboard/index.svelte (orchestrator 完整版) -->
<!-- 职责：作为「状态中枢」独占一份私有 store。其余子组件仅接收 props 渲染。 -->
<script lang="ts">
  import autoAnimate from "@formkit/auto-animate";
  import { onDestroy } from "svelte";

  import DashboardHeader from "./DashboardHeader.svelte";
  import RunControlCard from "./RunControlCard.svelte";
  import InfoBlocksGrid from "./InfoBlocksGrid.svelte";
  import RunLogPanel from "./RunLogPanel.svelte";
  import { dashboardStore } from "./dashboard.svelte";

  onDestroy(() => dashboardStore.destroy());
</script>

<div
  class="flex h-full min-h-screen w-full flex-col gap-6 bg-background p-8 text-foreground lg:p-12"
>
  <DashboardHeader />

  <RunControlCard />

  <section use:autoAnimate class="flex-1">
    {#if dashboardStore.runState === "idle"}
      <InfoBlocksGrid />
    {:else}
      <RunLogPanel />
    {/if}
  </section>
</div>
