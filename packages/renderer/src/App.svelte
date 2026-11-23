<!-- src/App.svelte -->
<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags */
  import Confirm from "$lib/components/Confirm.svelte";
  import DialogHost from "$lib/components/dialog/DialogHost.svelte";
  import ErrorScreen from "$lib/components/error-screen.svelte";
  import LoadingScreen from "$lib/components/loading-screen.svelte";
  import Tour from "$lib/components/Tour.svelte";
  import * as ImageZoom from "$lib/components/ui/image-zoom/index";
  import { Toaster } from "$lib/components/ui/sonner";
  import { setup as setupEvtHanle } from "$lib/evthandle";
  import { configStore } from "$lib/store/config.svelte";
  import { i18nStore } from "$lib/store/i18n.svelte";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { pluginStore } from "$lib/store/plugin.svelte";
  import { projectStore } from "$lib/store/project.svelte";
  import { recentProjectsStore } from "$lib/store/recent-projects.svelte";
  import { taskProgressStore } from "$lib/store/task-progress.svelte";
  import { longTaskStore } from "$lib/store/ui/longTask.svelte";
  import { windowStore } from "$lib/store/window.svelte";
  import { highlightThemeCss } from "$lib/utils/highlight";
  import { ModeWatcher } from "mode-watcher";
  import pTimeout from "p-timeout";
  import { onDestroy, onMount } from "svelte";
  import { cubicIn, cubicOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import { api, safeApi, setupEvt } from "./lib/utils/api";
  import Layout from "./route/layout.svelte";

  void highlightThemeCss;

  // 初始化完成标记：未完成时显示加载页
  let ready = $state(false);
  // 初始化异常：非空时显示错误页
  let initError = $state<unknown>(null);

  // 定义键盘事件处理函数
  const handleKeydown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const ctrlDown = event.ctrlKey || event.metaKey; // 兼容 macOS 的 Command 键

    // 1. 拦截 Ctrl + W (关闭标签/窗口)
    if (ctrlDown && key === "w") {
      event.preventDefault();
    }

    // 2. 拦截 Ctrl + R 或 F5 (刷新页面)
    if ((ctrlDown && key === "r") || key === "f5") {
      event.preventDefault();
    }

    // 3. 拦截 Ctrl + +/- 或 Ctrl + 0 (页面缩放)
    if (ctrlDown && ["+", "-", "=", "0"].includes(key)) {
      event.preventDefault();
    }

    // 4. 拦截开发者工具 (Ctrl+Shift+I / F12)
    if ((ctrlDown && event.shiftKey && key === "i") || key === "f12") {
      event.preventDefault();
    }

    if (event.key === "Tab") document.body.classList.add("kb-nav");
  };

  onMount(async () => {
    try {
      api();
      // 初始化事件机制。唯一返回 windowsId 的机会。
      const wid = await setupEvt();
      windowStore.init(wid);
      taskProgressStore.init();

      // 幂等注册：code-runtime 的角标数据源（按 task:update id 前缀汇总）。
      if (!longTaskStore.has("code-runtime")) {
        longTaskStore.registerTaskPrefix("code-runtime", "code-runtime:");
      }

      // ── 请求主进程显示主窗口（关闭 splash）────────────────
      // 调用时机：oRPC 端口已就绪之后、其余初始化启动之前。
      // 此时 LoadingScreen 已经在 DOM 中挂载（onMount 晚于首次渲染）；
      // 主进程的 reveal 闸门会等 ready-to-show 已触发后再 show()，
      // 因此不会在首帧前显示窗口 —— 白屏风险由此消除。
      // 若此调用失败，主进程有 4s fallback + 15s 硬兜底，不会被遗漏。
      void safeApi()
        .window.reveal({ reason: "App.svelte:post-setupEvt" })
        .catch((e) => {
          console.warn(
            "[App] reveal call failed (main-side fallback will handle)",
            e,
          );
        });

      // 后续初始化照旧
      await configStore.init();
      await Promise.all([
        pluginStore.init(),
        i18nStore.init(),
        setupEvtHanle(),
        recentProjectsStore.load(),
      ]);
      await projectStore.init();

      // 在捕获阶段（第三个参数传 true）监听，这比 hotkeys-js 的绑定更早执行
      window.addEventListener("keydown", handleKeydown, true);
      document.addEventListener("pointerdown", () => {
        document.body.classList.remove("kb-nav");
      });

      // 等待系统自举完成。
      await pTimeout(safeApi().system.bootstrapped(), {
        milliseconds: 15000,
        fallback: () => undefined as void,
      });

      // 系统自举完成，数据就绪，开始初始化依赖数据的部分。
      await Promise.all([messageStore.init()]);

      await windowStore.maximize();

      // 全部就绪，切换到正式界面
      ready = true;
    } catch (e) {
      console.error("initialization failed", e);
      initError = e;
    } finally {
      // 保险：若早期 reveal 调用因为偶然失败/竞态没生效，这里补一刀
      // （主进程 reveal 是幂等的，重复调用无副作用）。
      try {
        void safeApi()
          .window.reveal({ reason: "App.svelte:init-finally" })
          .catch(() => {
            /* 完全静默：主进程兜底处理 */
          });
      } catch (e) {
        console.warn("[App] finally reveal call failed synchronously", e);
      }
    }
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeydown, true);
  });
</script>

<Toaster position="bottom-right" richColors></Toaster>
<ModeWatcher />
<ImageZoom.Root gallery={false}>
  <Tour></Tour>
  <Confirm></Confirm>
  <!-- 整窗：占满视口，外层不滚动 -->
  <div class="app-shell">
    {#if initError}
      <div
        class="app-fill"
        in:fade={{ duration: 400, easing: cubicOut }}
        out:fade={{ duration: 400, easing: cubicIn }}
      >
        <ErrorScreen error={initError} />
      </div>
    {:else if ready}
      <div
        class="app-fill"
        in:fade={{ duration: 500, easing: cubicOut }}
        out:fade={{ duration: 400, easing: cubicIn }}
      >
        <Layout />
      </div>
    {:else}
      <div
        class="app-fill"
        in:fade={{ duration: 400, easing: cubicIn }}
        out:fade={{ duration: 400, easing: cubicIn }}
      >
        <LoadingScreen />
      </div>
    {/if}
  </div>

  <DialogHost />
</ImageZoom.Root>

<svelte:head>
  {@html `<style>${highlightThemeCss}</style>`}
</svelte:head>

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
