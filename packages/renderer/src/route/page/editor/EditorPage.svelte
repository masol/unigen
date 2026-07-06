<!-- src/lib/editor/EditorPage.svelte -->
<script lang="ts">
  import EditorToolbar from "./EditorToolbar.svelte";
  import MonacoEditor from "./MonacoEditor.svelte";
  import { editorStore, type BlueprintKind } from "./store.svelte";

  let {
    params = {},
  }: {
    params?: { kind?: string; id?: string; content?: string };
  } = $props();

  // main 不判断语言，只把 kind 原样透传（仅做合法性兜底）
  const kind = $derived<BlueprintKind>(
    params.kind === "metag" || params.kind === "capa"
      ? (params.kind as BlueprintKind)
      : "glossary",
  );

  $effect(() => {
    editorStore.init({
      kind,
      id: (params.id ?? "").trim(),
      contentFmt: params.content ?? "",
    });
  });
</script>

<div
  class="flex h-full w-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
>
  <EditorToolbar />
  <div class="relative min-h-0 flex-1">
    <MonacoEditor />
  </div>
</div>
