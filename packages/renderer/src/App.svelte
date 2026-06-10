<!-- src/App.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { ModeWatcher } from "mode-watcher";
  import { api, initApi, setupEvt } from "./lib/utils/api";
  import Layout from "./route/layout.svelte";
  import LoadingScreen from "$lib/components/loading-screen.svelte";
  import { Motion, AnimatePresence } from "svelte-motion";

  // 初始化完成标记：未完成时显示加载页
  let ready = $state(false);

  onMount(async () => {
    console.log("version=", window.versions);

    initApi();
    await setupEvt();

    const winid = await window.getWindowId();
    console.log("winid", winid);

    // 保留原有的异步初始化逻辑
    try {
      console.log(await api().test.test("test"));
    } catch (e) {
      console.error("init test failed", e);
    }

    // 给加载动画一个最小展示时间，避免闪烁（不需要可删除）
    // await new Promise((r) => setTimeout(r, 600));

    // 全部就绪，切换到正式界面
    ready = true;
  });
</script>

<ModeWatcher />

<!-- 整窗：占满视口，外层不滚动 -->
<div class="app-shell">
  <AnimatePresence list={ready ? [{ key: "app" }] : [{ key: "loading" }]}>
    {#if ready}
      <Motion
        let:motion
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div use:motion class="app-fill">
          <Layout />
        </div>
      </Motion>
    {:else}
      <Motion
        let:motion
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeIn" }}
      >
        <div use:motion class="app-fill">
          <LoadingScreen />
        </div>
      </Motion>
    {/if}
  </AnimatePresence>
</div>

<style>
  /* 整窗接管：占满视口，外层不滚动 */
  .app-shell {
    position: fixed;
    inset: 0;
    overflow: hidden;
  }

  /* 填充整个 shell，供加载页/正式内容共用 */
  .app-fill {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
</style>
