<!-- src/App.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { ModeWatcher } from "mode-watcher";
  import { api, setupEvt } from "./lib/utils/api";
  import Layout from "./route/layout.svelte";
  import LoadingScreen from "$lib/components/loading-screen.svelte";
  import ErrorScreen from "$lib/components/error-screen.svelte";
  import { Motion, AnimatePresence } from "svelte-motion";
  import { windowStore } from "$lib/store/window.svelte";
  import DialogHost from "$lib/components/dialog/DialogHost.svelte";
  import { Toaster } from "$lib/components/ui/sonner";
  import { pluginStore } from "$lib/store/plugin.svelte";
  import { configStore } from "$lib/store/config.svelte";
  import { i18nStore } from "$lib/store/i18n.svelte";
  import Tour from "$lib/components/Tour.svelte";
  import Confirm from "$lib/components/Confirm.svelte";

  // 初始化完成标记：未完成时显示加载页
  let ready = $state(false);
  // 初始化异常：非空时显示错误页
  let initError = $state<unknown>(null);

  onMount(async () => {
    try {
      // 初始化api, api()可用。
      api();
      // 初始化事件机制，evtbus生效。唯一返回windowsId的机会。
      const wid = await setupEvt();
      windowStore.init(wid);
      await configStore.init(); // 先加载配置信息。

      //初始化pluginSystem.
      await Promise.all([pluginStore.init(), i18nStore.init()]);

      await windowStore.maximize();

      // 给加载动画一个最小展示时间，避免闪烁（不需要可删除）
      // await new Promise((r) => setTimeout(r, 600));

      // 全部就绪，切换到正式界面
      ready = true;
    } catch (e) {
      // 拦截初始化过程中的任何异常，切换到错误页
      console.error("initialization failed", e);
      initError = e;
    }
  });

  // 当前应该渲染的视图 key，用于 AnimatePresence 切换
  const view = $derived(initError ? "error" : ready ? "app" : "loading");
</script>

<Toaster position="bottom-right" richColors></Toaster>
<ModeWatcher />
<Tour></Tour>
<Confirm></Confirm>
<!-- 整窗：占满视口，外层不滚动 -->
<div class="app-shell">
  <AnimatePresence list={[{ key: view }]}>
    {#if initError}
      <Motion
        let:motion
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div use:motion class="app-fill">
          <ErrorScreen error={initError} />
        </div>
      </Motion>
    {:else if ready}
      <Motion
        let:motion
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
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
        animate={{ opacity: 1 }}
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

<DialogHost />

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
