<!-- src/lib/editor/EditorPage.svelte -->
<!-- 路由级容器：铺满父区域，无边无距。直接复用全局 editorStore 单例。 -->
<script lang="ts">
  import EditorStatusBar from "./EditorStatusBar.svelte";
  import EditorToolbar from "./EditorToolbar.svelte";
  import MonacoEditor from "./MonacoEditor.svelte";
  import { editorStore, type EditorKind } from "./store.svelte";

  // svelte-spa-router 会以 params 传入路由参数
  let {
    params = {},
  }: {
    params?: { kind?: string; id?: string; content?: string };
  } = $props();

  const normalizedKind = $derived<EditorKind>(
    params.kind === "json" || params.kind === "js"
      ? (params.kind as EditorKind)
      : "markdown",
  );
  const inlineContent = $derived(
    params.content === "true" || params.content === "1",
  );

  // 参数变化时初始化；指纹一致则 store.init 内部直接复用，不重载。
  $effect(() => {
    editorStore.init({
      kind: normalizedKind,
      id: params.id ?? "",
      content: inlineContent,
    });
  });
</script>

<!-- 铺满父容器：h-full w-full，无 padding / 无外框 -->
<div
  class="flex h-full w-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
>
  <EditorToolbar />

  <!-- 编辑区主体：占满剩余空间，无内边距 -->
  <div class="relative min-h-0 flex-1">
    <MonacoEditor />
  </div>

  <EditorStatusBar />
</div>
