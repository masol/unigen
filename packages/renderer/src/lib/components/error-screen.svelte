<!-- src/lib/components/error-screen.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import {
    IconAlertTriangle,
    IconCheck,
    IconChevronDown,
    IconCopy,
    IconLogout,
    IconRefresh,
  } from "@tabler/icons-svelte";
  import { Motion } from "svelte-motion";

  let {
    error,
    title = "初始化失败",
    description = "应用启动过程中发生异常，无法继续加载。你可以重试或退出。",
  }: {
    error?: unknown;
    title?: string;
    description?: string;
  } = $props();

  // 错误信息归一化：兼容 Error 实例、字符串及任意对象
  const message = $derived.by(() => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    if (error == null) return "";
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  });

  // 详细堆栈（如有）
  const stack = $derived.by(() => {
    if (error instanceof Error && error.stack) return error.stack;
    return "";
  });

  let detailOpen = $state(false);
  let copied = $state(false);

  async function copyDetail() {
    const text = stack || message;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (e) {
      console.error("copy failed", e);
    }
  }

  async function exit() {
    // 优先调用应用退出接口，失败则尝试关闭窗口
    try {
      //   if (window.exitApp) {
      //     await window.exitApp();
      //     return;
      //   }
    } catch (e) {
      console.error("exitApp failed", e);
    }
    try {
      window.close();
    } catch (e) {
      console.error("window.close failed", e);
    }
  }

  function reload() {
    window.location.reload();
  }
</script>

<div
  class="flex h-full w-full items-center justify-center bg-background px-6 py-10 text-foreground"
>
  <Motion
    let:motion
    initial={{ opacity: 0, y: 16, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.45, ease: "easeOut" }}
  >
    <div
      use:motion
      class="w-full max-w-lg rounded-3xl border border-border/50 bg-card p-8 shadow-xl sm:p-10"
    >
      <!-- 图标 -->
      <div class="mb-6 flex justify-center">
        <Motion
          let:motion
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <div
            use:motion
            class="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive ring-8 ring-destructive/5"
          >
            <IconAlertTriangle class="size-8" stroke={1.8} />
          </div>
        </Motion>
      </div>

      <!-- 标题与说明 -->
      <div class="mb-6 text-center">
        <h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
        {#if description}
          <p class="mt-2 text-sm text-muted-foreground">
            {description}
          </p>
        {/if}
      </div>

      <!-- 错误摘要 -->
      {#if message}
        <div
          class="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3"
        >
          <p class="wrap-break-word text-sm font-medium text-destructive">
            {message}
          </p>
        </div>
      {/if}

      <!-- 详细信息（可折叠） -->
      {#if stack}
        <Collapsible.Root bind:open={detailOpen} class="mb-6">
          <div class="flex items-center justify-between">
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="sm"
                  class="gap-1.5 px-2 text-muted-foreground"
                >
                  <IconChevronDown
                    class="size-4 transition-all duration-200 {detailOpen
                      ? 'rotate-180'
                      : ''}"
                  />
                  {detailOpen ? "隐藏详情" : "查看详情"}
                </Button>
              {/snippet}
            </Collapsible.Trigger>

            <Button
              variant="ghost"
              size="sm"
              class="gap-1.5 px-2 text-muted-foreground"
              onclick={copyDetail}
            >
              {#if copied}
                <IconCheck class="size-4 text-primary" />
                已复制
              {:else}
                <IconCopy class="size-4" />
                复制
              {/if}
            </Button>
          </div>

          <Collapsible.Content>
            <pre
              class="mt-2 max-h-56 overflow-auto rounded-xl bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground"><code
                >{stack}</code
              ></pre>
          </Collapsible.Content>
        </Collapsible.Root>
      {/if}

      <!-- 操作按钮 -->
      <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button
          variant="outline"
          class="gap-2 rounded-xl transition-all duration-200 hover:-translate-y-0.5 sm:flex-1"
          onclick={reload}
        >
          <IconRefresh class="size-4" />
          重试
        </Button>
        <Button
          variant="destructive"
          class="gap-2 rounded-xl transition-all duration-200 hover:-translate-y-0.5 sm:flex-1"
          onclick={exit}
        >
          <IconLogout class="size-4" />
          退出
        </Button>
      </div>
    </div>
  </Motion>
</div>
