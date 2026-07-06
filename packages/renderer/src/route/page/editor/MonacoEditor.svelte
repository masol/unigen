<!-- src/lib/editor/MonacoEditor.svelte -->
<!-- Monaco 挂载点：容器常驻 DOM，Skeleton/遮罩为覆盖层，避免重建时创建时序错乱。 -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */

  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as monaco from "monaco-editor";
  import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
  import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
  import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
  import { JS_COMPLETIONS, editorStore as store } from "./store.svelte";

  let container = $state<HTMLDivElement | null>(null);
  let editor: monaco.editor.IStandaloneCodeEditor | null = null;
  let mounted = $state(false);
  /** 防止内部 setValue 与外部同步互相触发 */
  let syncingFromStore = false;

  function setupWorkerEnv() {
    if ((self as any).__monacoEnvReady) return;
    self.MonacoEnvironment = {
      getWorker(_: unknown, label: string) {
        if (label === "json") return new jsonWorker();
        if (label === "typescript" || label === "javascript")
          return new tsWorker();
        return new editorWorker();
      },
    };
    (self as any).__monacoEnvReady = true;
  }

  function defineTheme() {
    monaco.editor.defineTheme("shadcn-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: { "editor.background": "#00000000" },
    });
  }

  function registerJsCompletionsOnce() {
    if ((self as any).__jsCompletionsReady) return;
    monaco.languages.registerCompletionItemProvider("javascript", {
      triggerCharacters: ["."],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn,
        );
        const suggestions = JS_COMPLETIONS.map((c) => ({
          label: c.label,
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: c.insertText,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: c.detail,
          documentation: c.documentation,
          range,
        }));
        return { suggestions };
      },
    });
    (self as any).__jsCompletionsReady = true;
  }

  // ── 创建编辑器：只依赖 container，与 store.loading 解耦 ──
  // 容器常驻 DOM，因此重建时 container 一挂载即创建，不再受 loading 时序影响。
  $effect(() => {
    if (!container || editor) return;

    setupWorkerEnv();
    defineTheme();
    registerJsCompletionsOnce();

    editor = monaco.editor.create(container, {
      value: store.content,
      language: store.language,
      theme: "shadcn-dark",
      automaticLayout: true,
      fontSize: 14,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
      lineHeight: 22,
      padding: { top: 12, bottom: 12 },
      minimap: { enabled: store.minimap },
      wordWrap: store.wordWrap ? "on" : "off",
      lineNumbers: "on",
      renderLineHighlight: "all",
      smoothScrolling: true,
      cursorSmoothCaretAnimation: "on",
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      scrollbar: { vertical: "auto", horizontal: "auto", useShadows: false },
      readOnly: store.readonly,
    });

    const ed = editor;
    store.attachEditor(ed);
    mounted = true;

    ed.onDidChangeModelContent(() => {
      if (syncingFromStore) return;
      store.content = ed.getValue();
    });

    ed.onDidChangeCursorSelection((e) => {
      const model = ed.getModel();
      const selLen = model ? model.getValueInRange(e.selection).length : 0;
      store.setCursor(
        e.selection.positionLineNumber,
        e.selection.positionColumn,
        selLen,
      );
    });

    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      store.save();
    });
  });

  // ── store → 编辑器 单向同步（load/reload 完成后覆盖内容）──
  $effect(() => {
    const next = store.content;
    if (!editor || !mounted) return;
    if (editor.getValue() === next) return;
    syncingFromStore = true;
    editor.setValue(next);
    syncingFromStore = false;
  });

  // ── 语言切换同步 ──
  $effect(() => {
    const lang = store.language;
    const model = editor?.getModel();
    if (model) monaco.editor.setModelLanguage(model, lang);
  });

  // ── 只读态同步 ──
  $effect(() => {
    editor?.updateOptions({ readOnly: store.readonly });
  });

  // ── 换行 / 小地图开关同步 ──
  $effect(() => {
    editor?.updateOptions({
      wordWrap: store.wordWrap ? "on" : "off",
      minimap: { enabled: store.minimap },
    });
  });

  // 清理
  $effect(() => {
    return () => {
      const ed = editor;
      editor = null;
      mounted = false;
      if (ed) {
        store.detachEditor(ed);
        ed.dispose();
      }
    };
  });
</script>

<div class="absolute inset-0">
  <!-- 容器常驻：不再被 {#if loading} 包裹，重建即创建 -->
  <div
    bind:this={container}
    class="absolute inset-0 {store.readonly ? 'pointer-events-none' : ''}"
  ></div>

  <!-- 加载态：覆盖层，盖在容器之上 -->
  {#if store.loading}
    <div
      class="absolute inset-0 z-20 flex gap-4 bg-background p-4 animate-fade-in"
    >
      <div class="flex w-10 shrink-0 flex-col gap-3 pt-1">
        {#each Array(18) as _, i (i)}
          <Skeleton class="h-4 w-6 rounded-lg" />
        {/each}
      </div>
      <div class="flex flex-1 flex-col gap-3 pt-1">
        {#each Array(18) as _, i (i)}
          <Skeleton
            class="h-4 rounded-lg"
            style="width: {[
              92, 68, 80, 45, 74, 88, 60, 96, 52, 78, 84, 40, 70, 90, 64, 82,
              56, 72,
            ][i]}%"
          />
        {/each}
      </div>
    </div>
  {/if}

  <!-- 异步动作遮罩 -->
  {#if store.busy}
    <div
      class="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[1px] animate-fade-in"
    >
      <div
        class="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-6 py-3 shadow-xl"
      >
        <span class="size-2 animate-pulse rounded-full bg-primary"></span>
        <span class="text-sm text-foreground">
          {store.busyAction === "save"
            ? "正在保存…"
            : store.busyAction === "reload"
              ? "正在重新加载…"
              : "正在验证…"}
        </span>
      </div>
    </div>
  {/if}
</div>
