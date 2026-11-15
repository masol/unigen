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

  let editor: ReturnType<typeof createEditor> | undefined = createEditor({
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
