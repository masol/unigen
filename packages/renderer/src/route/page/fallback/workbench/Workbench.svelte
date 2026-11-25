<!-- packages/renderer/src/route/page/fallback/workbench/Workbench.svelte -->
<!-- Agent 对话工作台：唯一主视图 -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { ChatCommand } from "$lib/store/local/commands.store.svelte";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { toast } from "svelte-sonner";
  import { fade } from "svelte/transition";
  import { ChatInput } from "./chat-input";
  import ChatMessageList from "./ChatMessageList.svelte";
  import { confirmClearAll } from "./confirm.svelte";
  import TypingDots from "./TypingDots.svelte";
  import WorkbenchHeader from "./WorkbenchHeader.svelte";

  function blurActive() {
    if (typeof document === "undefined") return;
    (document.activeElement as HTMLElement | null)?.blur();
  }

  // 进入同步态时主动 blur，避免焦点仍留在即将禁用的输入框上
  $effect(() => {
    if (!messageStore.isReloading) return;
    blurActive();
  });

  // const instanceId = crypto.randomUUID();
  // const mountedAt = performance.now();
  // onMount(() => {
  //   console.error("[Workbench] mount", instanceId, mountedAt);
  //   return () => {
  //     console.error("[Workbench] cleanup", instanceId);
  //   };
  // });

  // onDestroy(() => {
  //   console.error("[Workbench] destroy", instanceId);
  // });

  /**
   * 发送入口。
   *
   * tools / skills 的唯一真源是 messageStore.selectedTools/selectedSkills，
   * 由 messageStore 在 AIResponse 启动时直接快照读取；此处只负责把附件路径落到
   * 用户消息上，并驱动 AIResponse 启动本轮对话。
   */
  async function handleSend(content: string, files: string[] = []) {
    const trimmed = content.trim();
    if (
      !trimmed ||
      messageStore.isLoading ||
      messageStore.isReloading ||
      messageStore.isDeleting
    )
      return;

    blurActive();

    if (trimmed === "/clear") {
      await handleClear();
      return;
    }

    const userMsg = messageStore.addMessage({
      role: "user",
      content: trimmed,
      files,
    });

    await messageStore.AIResponse(userMsg);
  }

  async function handleClear() {
    if (
      !messageStore.hasMessages ||
      messageStore.isLoading ||
      messageStore.isReloading ||
      messageStore.isDeleting
    )
      return;
    blurActive();
    const ok = await confirmClearAll();
    if (!ok) return;
    await messageStore.clear();
  }

  function handleCommand(cmd: ChatCommand) {
    if (cmd.id === "clear") {
      void handleClear();
    }
  }

  function handleRecord() {
    toast.warning("语音输入功能尚未实现");
  }

  function errorText(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
</script>

<div class="flex h-full w-full flex-col overflow-hidden bg-background">
  <WorkbenchHeader onClear={handleClear} />

  <main class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-hidden">
      {#if messageStore.isReloading}
        <div
          class="flex h-full w-full items-center justify-center"
          in:fade={{ duration: 120 }}
        >
          <div
            class="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-muted/30 px-6 py-5"
          >
            <TypingDots label="正在同步会话…" />
            <p class="text-xs text-muted-foreground">正在读取消息与追踪信息</p>
          </div>
        </div>
      {:else}
        <!--
          最外层渲染兜底：捕获 ChatMessageList / ChatRoundNav / EmptyState 等
          的渲染期异常，避免 effect flush 被打断后工作台永久停留在上一帧。
          ChatMessageList 内部还有单条消息级 boundary，两者是互补关系。
        -->
        <svelte:boundary>
          <ChatMessageList />
          {#snippet failed(error, reset)}
            <div class="flex h-full w-full items-center justify-center p-6">
              <div
                class="w-full max-w-md space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center"
              >
                <div class="text-sm font-medium text-destructive">
                  对话视图渲染出错
                </div>
                <p
                  class="text-xs leading-relaxed text-muted-foreground wrap-break-word"
                >
                  {errorText(error)}
                </p>
                <div class="flex items-center justify-center gap-2">
                  <Button variant="secondary" size="sm" onclick={reset}>
                    重试渲染
                  </Button>
                  <Button variant="ghost" size="sm" onclick={handleClear}>
                    清空对话
                  </Button>
                </div>
              </div>
            </div>
          {/snippet}
        </svelte:boundary>
      {/if}
    </div>

    <ChatInput
      onSend={handleSend}
      onCommand={handleCommand}
      onRecord={handleRecord}
    />
  </main>
</div>
