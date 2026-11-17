<script lang="ts">
  import { createEditor, Edra } from "$lib/components/edra/shadcn/index.js";
  import PageWrapper from "$lib/components/PageWrapper.svelte";
  import { pacStore } from "$lib/store/ui/pac.svelte";
  import { default as log } from "electron-log/renderer";
  import { onDestroy, onMount } from "svelte";

  import { readEditorMarkdown } from "./editor-utils";
  import { createPacMetaActions, matchPacMetaHotkey } from "./pac-meta-actions";
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

      pacStore.setEditorContent(markdown, editor);
    },
  });

  editor?.setEditable(true);

  const metaActions = createPacMetaActions(pacStore);

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
    if (isSaveCombo) {
      event.preventDefault();
      if (pacStore.dirty && !pacStore.saving) {
        void pacStore.save();
      }
      return;
    }

    if (matchPacMetaHotkey(metaActions, event)) {
      return;
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
    <!-- 全高 flex 容器：header 固定，正文独立滚动，无外层卡片 padding -->
    <div class="flex h-full w-full flex-col overflow-hidden">
      <Edra {editor}>
        <!--
          Header 与 Toolbar 的定制入口说明（请勿删除，便于后续维护）：
          - Toolbar 内容与按钮：修改 packages/renderer/src/lib/components/edra/shadcn/components/Toolbar.svelte
          - 气泡菜单（BubbleMenu）：修改 packages/renderer/src/lib/components/edra/shadcn/components/menu/BubbleMenu.svelte
          - Edra 编辑器整体入口：packages/renderer/src/lib/components/edra/shadcn/index.ts
        -->
        <PacEditorHeader
          class="shrink-0 border-b border-border/50 px-8 pt-4 pb-3"
        >
          {#snippet toolbar()}
            <Edra.Toolbar
              class="max-w-full! shrink-0 justify-start overflow-x-auto scrollbar-none border-b-0 p-0"
              onSave={() => void pacStore.save()}
              canSave={pacStore.dirty}
              saving={pacStore.saving}
              {metaActions}
              metaMenus={metaActions}
            />
          {/snippet}
        </PacEditorHeader>

        <!-- 正文区域：占满剩余高度，独立滚动 -->
        <PacEditorCanvas class="min-h-0 flex-1 overflow-y-auto" />

        <Edra.BubbleMenu />
        <Edra.DragHandle />
      </Edra>
    </div>
  {/if}
</PageWrapper>
