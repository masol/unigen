<script lang="ts">
  import { IconSourceCode } from "@tabler/icons-svelte";
  import ModelAlerts from "./ModelAlerts.svelte";
  import RecentProjects from "./RecentProjects.svelte";
  import WelcomeActions from "./WelcomeActions.svelte";
</script>

<!--
  三层结构的职责:
    外层 .outer: flex flex-col + w-full, 建立纵向布局 context 并强制撑满 ScrollArea Viewport
                 (对 bits-ui 的 display:table 中间层尤其关键)
    内层 .inner: mx-auto + max-w-2xl, 在撑开的宽度中居中
    section:     真正的内容分块
-->
<div class="flex w-full flex-col">
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-10 p-8 md:p-12">
    <ModelAlerts />

    <section class="flex flex-col items-center gap-6 pt-6">
      <IconSourceCode size={40} stroke={1.5} class="text-muted-foreground/40" />
      <div class="space-y-2 text-center">
        <h2 class="text-2xl font-semibold tracking-tight text-foreground">
          欢迎
        </h2>
        <p class="text-sm text-muted-foreground">
          打开已有项目或创建新项目以开始
        </p>
      </div>
      <WelcomeActions />
    </section>

    <RecentProjects />
  </div>
</div>
