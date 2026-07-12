<!--╭─────────────────────────────────────────────────────────╮ -->
<!-- │ [子组件 → header/menu/run-menu.svelte]                  │ -->
<!-- │ 职责：启动 / 终止 / 强制终止                              │ -->
<!-- ╰─────────────────────────────────────────────────────────╯ -->
<script lang="ts">
  import * as Menubar from "$lib/components/ui/menubar";
  import { dashboardStore } from "$lib/store/dashboard.svelte";
  import { projectStore } from "$lib/store/project.svelte";
  import {
    IconHandStop,
    IconLoader2,
    IconPlayerPlay,
    IconPlayerStop,
  } from "@tabler/icons-svelte";
  import MenuShortcut from "./menu-shortcut.svelte";

  const isBusy = $derived(projectStore.isBusy);
  const hasProject = $derived(!!projectStore.path);
  const runState = $derived(projectStore.runState);

  const canStart = $derived(hasProject && runState === "idle" && !isBusy);
  const canStop = $derived(runState === "running");
  const canForceStop = $derived(runState === "terminating");

  async function start() {
    if (!canStart) return;
    await dashboardStore.start();
  }
  async function stop() {
    if (!canStop) return;
    await dashboardStore.stop(false);
  }
  async function forceStop() {
    if (!canForceStop) return;
    await dashboardStore.stop(true);
  }
</script>

<Menubar.Menu>
  <Menubar.Trigger
    class="cursor-default select-none h-9 rounded-none px-2.5 text-xs font-normal data-[state=open]:bg-accent/80 hover:bg-accent/80"
  >
    运行
  </Menubar.Trigger>
  <Menubar.Content align="start" class="select-none z-200 min-w-48">
    <Menubar.Item disabled={!canStart} onSelect={start}>
      <IconPlayerPlay size={20} stroke={1.5} class="mr-2 text-primary" />
      启动
      <MenuShortcut command="project.start" />
    </Menubar.Item>
    <Menubar.Item disabled={!canStop} onSelect={stop}>
      <IconPlayerStop
        size={20}
        stroke={1.5}
        class="mr-2 text-muted-foreground"
      />
      终止
      <MenuShortcut command="project.stop" />
    </Menubar.Item>
    <Menubar.Item disabled={!canForceStop} onSelect={forceStop}>
      {#if canForceStop}
        <IconLoader2
          size={20}
          stroke={1.5}
          class="mr-2 animate-spin text-destructive"
        />
      {:else}
        <IconHandStop
          size={20}
          stroke={1.5}
          class="mr-2 text-muted-foreground"
        />
      {/if}
      强制终止
    </Menubar.Item>
  </Menubar.Content>
</Menubar.Menu>
