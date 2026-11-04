<!-- Agent 对话工作台：唯一主视图 -->
<script lang="ts">
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { toast } from "svelte-sonner";
  import ChatInput from "./ChatInput.svelte";
  import ChatMessageList from "./ChatMessageList.svelte";
  import type { ChatCommand } from "./commands";
  import WorkbenchHeader from "./WorkbenchHeader.svelte";

  let inputValue = $state("");

  async function handleSend() {
    const content = inputValue.trim();
    if (!content || messageStore.isLoading) return;

    if (content === "/clear") {
      inputValue = "";
      await handleClear();
      return;
    }

    const userMsg = messageStore.addMessage({ role: "user", content });
    inputValue = "";
    await messageStore.AIResponse(userMsg);
  }

  async function handleClear() {
    if (!messageStore.hasMessages || messageStore.isLoading) return;
    messageStore.clear();
  }

  function handleCommand(cmd: ChatCommand) {
    if (cmd.id === "clear") {
      inputValue = "";
      void handleClear();
    }
  }

  function handleAttach() {
    toast.warning("附加文件功能尚未实现");
  }

  function handleRecord() {
    toast.warning("语音输入功能尚未实现");
  }
</script>

<div class="flex h-full w-full flex-col overflow-hidden bg-background">
  <WorkbenchHeader />

  <main class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-hidden">
      <ChatMessageList />
    </div>

    <ChatInput
      bind:value={inputValue}
      canClear={messageStore.hasMessages}
      onSend={handleSend}
      onCommand={handleCommand}
      onAttach={handleAttach}
      onRecord={handleRecord}
      onClear={handleClear}
    />
  </main>
</div>
