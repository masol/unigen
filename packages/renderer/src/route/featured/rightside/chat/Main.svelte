<!-- src/lib/components/chat/ChatInterface.svelte -->
<script lang="ts">
  import ChatHeader from "./ChatHeader.svelte";
  import ChatMessageList from "./ChatMessageList.svelte";
  import ChatInput from "./ChatInput.svelte";
  import { messageStore } from "./msg.svelte";

  let inputValue = $state("");

  async function handleSend() {
    if (!inputValue.trim() || messageStore.isLoading) return;

    const userMessageContent = inputValue.trim();
    messageStore.addMessage({
      role: "user",
      content: userMessageContent,
    });

    inputValue = "";

    await messageStore.AIResponse(userMessageContent);
  }

  function handleClear() {
    messageStore.clear();
  }
</script>

<div class="flex h-full w-full flex-col">
  <ChatHeader canClear={messageStore.hasMessages} onClear={handleClear} />

  <ChatMessageList />

  <ChatInput bind:value={inputValue} onSend={handleSend} />
</div>
