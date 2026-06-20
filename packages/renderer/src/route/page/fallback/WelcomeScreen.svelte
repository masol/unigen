<script lang="ts">
  import { IconSourceCode } from "@tabler/icons-svelte";
  import ModelAlerts from "./ModelAlerts.svelte";
  import WelcomeActions from "./WelcomeActions.svelte";
  import RecentProjects from "./RecentProjects.svelte";
</script>

<div class="mx-auto flex h-full w-full max-w-2xl flex-col gap-10 p-8 md:p-12">
  <ModelAlerts />

  <section class="flex flex-col items-center gap-6 pt-6">
    <IconSourceCode class="size-10 text-muted-foreground/40" />
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
