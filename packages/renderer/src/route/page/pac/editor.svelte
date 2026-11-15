<script lang="ts">
  import { createEditor, Edra } from "$lib/components/edra/shadcn/index.js";
  import PageWrapper from "$lib/components/PageWrapper.svelte";
  import { pacStore } from "$lib/store/ui/pac.svelte";
  import { default as log } from "electron-log/renderer";
  import { onDestroy, onMount } from "svelte";

  import { readEditorMarkdown } from "./editor-utils";
  import PacEditorCanvas from "./PacEditorCanvas.svelte";
  import PacEditorError from "./PacEditorError.svelte";
  import PacEditorHeader from "./PacEditorHeader.svelte";
  import PacEditorLoading from "./PacEditorLoading.svelte";

  /**
   * Edra AI 助手回调。
   *
   * 当前后端尚未接入。先通过 toast 明确告知用户
   * “AI 功能尚未支持”，同时通过 onError 回传给 Edra，
   * 使其清理 AIHighlight mark 并结束生成流程。
   *
   * 固定 toast id：Space 触发的 autocompletion 可能高频调用本回调，
   * sonner 会用相同 id 复用同一个 toast，避免刷屏。
   */
  // async function callAI(
  //   _prompt: string,
  //   _onChunk: (chunk: string) => void,
  //   onError: (error: Error) => void,
  // ): Promise<void> {
  //   const error = new Error("AI 功能尚未支持");
  //   log.warn("[PacEditor] callAI invoked, but AI backend is not configured");
  //   toast.error(error.message, { id: "pac-editor-ai-not-supported" });
  //   onError(error);
  // }

  let editor: ReturnType<typeof createEditor> | undefined = createEditor({
    // callAI,
    onUpdate: () => {
      if (!editor) return;

      const markdown = readEditorMarkdown(editor);
      if (markdown === null) {
        log.error(
          "[PacEditor] editor cannot serialize markdown; Markdown extension is missing or not configured",
        );
        return;
      }

      pacStore.setEditorContent(markdown);
    },
  });

  editor?.setEditable(true);

  onMount(() => {
    if (editor) pacStore.attachEditor(editor);
  });

  onDestroy(() => {
    if (!editor) return;

    pacStore.detachEditor(editor);
    editor.destroy();
    editor = undefined;
  });

  const handleBeforeLeave = pacStore.beforeLeave.bind(pacStore);

  function handleKeydown(event: KeyboardEvent) {
    const isSaveCombo =
      (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s";
    if (!isSaveCombo) return;

    event.preventDefault();
    if (pacStore.dirty && !pacStore.saving) {
      void pacStore.save();
    }
  }

  // 通过修改： packages/renderer/src/lib/components/edra/shadcn/components/Toolbar.svelte 来修改toolbar内容。
  // packages/renderer/src/lib/components/edra/shadcn/components/menu/BubbleMenu.svelte 修改bubbleMenu.
  // Editor的入口文件(下面的Edra)：
</script>

<svelte:window onkeydown={handleKeydown} />

<PageWrapper beforeLeave={handleBeforeLeave}>
  {#if pacStore.isLoading}
    <PacEditorLoading />
  {:else if pacStore.isError}
    <PacEditorError />
  {:else if editor}
    <div class="flex h-full w-full flex-col overflow-hidden p-8">
      <div class="min-h-0 flex-1 *:h-full">
        <Edra {editor}>
          <div class="flex h-full min-h-0 flex-col gap-4">
            <PacEditorHeader>
              {#snippet toolbar()}
                <Edra.Toolbar
                  class="max-w-full! shrink-0 justify-start overflow-x-auto scrollbar-none border-b-0 p-1"
                />
              {/snippet}
            </PacEditorHeader>

            <PacEditorCanvas />
          </div>

          <Edra.BubbleMenu />
          <Edra.DragHandle />
        </Edra>
      </div>
    </div>
  {/if}
</PageWrapper>
