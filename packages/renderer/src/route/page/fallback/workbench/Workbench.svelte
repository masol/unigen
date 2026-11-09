<!-- Agent 对话工作台：唯一主视图 -->
<script lang="ts">
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { toast } from "svelte-sonner";
  import { fade } from "svelte/transition";
  import { ChatInput, type ChatCommand } from "./chat-input";
  import ChatMessageList from "./ChatMessageList.svelte";
  import TypingDots from "./TypingDots.svelte";
  import WorkbenchHeader from "./WorkbenchHeader.svelte";

  let inputValue = $state("");

  function blurActive() {
    if (typeof document === "undefined") return;
    (document.activeElement as HTMLElement | null)?.blur();
  }

  // 进入同步态时主动 blur，避免焦点仍留在即将禁用的输入框上
  $effect(() => {
    if (!messageStore.isReloading) return;
    blurActive();
  });

  async function handleSend(files: string[] = []) {
    const content = inputValue.trim();
    if (!content || messageStore.isLoading || messageStore.isReloading) return;

    blurActive();

    if (content === "/clear") {
      inputValue = "";
      await handleClear();
      return;
    }

    const userMsg = messageStore.addMessage({ role: "user", content, files });
    inputValue = "";

    if (files.length > 0) {
      // 文件完整路径随消息发送；持久化到消息记录需扩展 ChatMessage/AIResponse
      console.debug("[chat] 附件文件:", files);
    }

    await messageStore.AIResponse(userMsg);
  }

  async function handleClear() {
    if (!messageStore.hasMessages || messageStore.isLoading) return;
    blurActive();
    messageStore.clear();
  }

  function handleCommand(cmd: ChatCommand) {
    if (cmd.id === "clear") {
      inputValue = "";
      void handleClear();
    }
  }

  function handleRecord() {
    toast.warning("语音输入功能尚未实现");
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
        <ChatMessageList />
      {/if}
    </div>

    <ChatInput
      bind:value={inputValue}
      onSend={handleSend}
      onCommand={handleCommand}
      onRecord={handleRecord}
    />
  </main>
</div>
