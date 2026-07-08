<!-- src/lib/editor/MonacoEditor.svelte -->
<!-- Monaco 挂载点：容器常驻 DOM，Skeleton/遮罩为覆盖层，避免重建时创建时序错乱。 -->
<!-- 全部语言（js/json/markdown）使用 @shikijs/monaco 提供 TextMate 级高亮； -->
<!-- 主题走 Shiki（亮/暗两套），跟随 <html> 的 dark class 响应 tailwind 主题。 -->
<!-- 注意：Shiki 只接管“语法高亮”，校验/格式化/补全等语言服务仍由 Monaco worker 提供。 -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */

  import { Skeleton } from "$lib/components/ui/skeleton";
  import { shikiToMonaco } from "@shikijs/monaco";
  import * as monaco from "monaco-editor";
  import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
  import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
  import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
  import { createHighlighter } from "shiki";
  import { JS_COMPLETIONS } from "./completes";
  import NODE_AND_CUSTOM_DTS from "./global.d.txt?raw";
  import { editorStore as store } from "./store.svelte";

  // 亮/暗两套 Shiki 主题（可替换为任意 Shiki 内置主题）
  const THEME_DARK = "vitesse-dark";
  const THEME_LIGHT = "vitesse-light";
  // Shiki 接管这些语言的语法高亮（token 上色）
  const SHIKI_LANGS = ["javascript", "json", "markdown"] as const;
  // Shiki 初始化失败时的内置回退主题
  const FALLBACK_DARK = "vs-dark";
  const FALLBACK_LIGHT = "vs";

  let container = $state<HTMLDivElement | null>(null);
  let editor = $state.raw<monaco.editor.IStandaloneCodeEditor | null>(null);
  /** Shiki 是否初始化成功；失败则用内置主题回退，保证编辑器仍可用 */
  let shikiOk = false;
  /** 防止内部 setValue 与外部同步互相触发 */
  let syncingFromStore = false;
  /** tailwind 主题（dark class）监听器，卸载时断开 */
  let themeObserver: MutationObserver | null = null;

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

  function isDark() {
    return (
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
    );
  }

  // 当前应使用的主题：Shiki 就绪用 Shiki 主题，否则回退内置主题
  function themeName() {
    if (shikiOk) return isDark() ? THEME_DARK : THEME_LIGHT;
    return isDark() ? FALLBACK_DARK : FALLBACK_LIGHT;
  }

  // ── Shiki → Monaco：全局单例，重挂载时复用同一高亮器；返回是否成功 ──
  function ensureShiki(): Promise<boolean> {
    const g = self as any;
    if (g.__shikiSetup) return g.__shikiSetup as Promise<boolean>;

    g.__shikiSetup = (async () => {
      try {
        const highlighter = await createHighlighter({
          themes: [THEME_DARK, THEME_LIGHT],
          langs: [...SHIKI_LANGS],
        });

        // 只有已注册的 languageId 才会被 Shiki 高亮（monaco 通常已内置，这里兜底）
        const registered = new Set(
          monaco.languages.getLanguages().map((l) => l.id),
        );
        for (const id of SHIKI_LANGS) {
          if (!registered.has(id)) monaco.languages.register({ id });
        }

        // 接管语法高亮，并注册 Shiki 主题（此后 setTheme 只能用已注册主题名）
        shikiToMonaco(highlighter, monaco);
        return true;
      } catch (e) {
        // 稳定优先：Shiki 失败不阻断编辑器，回退内置主题
        console.error(
          "[MonacoEditor] Shiki init failed, fallback to builtin theme:",
          e,
        );
        return false;
      }
    })();

    return g.__shikiSetup as Promise<boolean>;
  }

  function setupJsLanguageOnce() {
    if ((self as any).__jsLangReady) return;

    // ✅ 新版顶层命名空间，替代已废弃的 monaco.languages.typescript
    const ts = monaco.typescript;
    const js = ts.javascriptDefaults;

    // 编译/环境选项：面向 Node，不引入 DOM
    js.setCompilerOptions({
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Classic,
      // ModuleDetectionKind.Force === 3；类型未暴露则用数值兜底
      moduleDetection: (ts as any).ModuleDetectionKind?.Force ?? 3,
      allowJs: true,
      checkJs: true,
      lib: ["esnext"],
      allowNonTsExtensions: true,
      noEmit: true,
    });

    js.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [
        // 1375, // 'await' expressions are only allowed at the top level of a module...
        // 1378, // Top-level 'await' expressions ... module/target 限制
        // 1431, // 'for await' loops ... 顶层限制
        // 1432, // Top-level 'for await' ...
        // 1108, // 'return' can only be used within a function body（with 包裹场景）
        // 2304, // Cannot find name 'await'（await 被当标识符时的残留误报，见下）
      ],
    });

    js.addExtraLib(NODE_AND_CUSTOM_DTS, "ts:filename/globals.d.ts");

    // 手写 "." 触发补全（如已改用 .d.ts 方案可整块删除）
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

    (self as any).__jsLangReady = true;
  }

  // ── 创建编辑器：只依赖 container，与 store.loading 解耦 ──
  // 容器常驻 DOM；因 Shiki 高亮器为异步，创建流程改为 await 就绪后再建 editor，
  // 保证设置 Shiki 主题时主题已注册。Shiki 失败则用内置主题回退，不阻断创建。
  $effect(() => {
    if (!container || editor) return;

    // 组件在异步就绪前被卸载时，用该标志阻止“迟到”的创建
    let disposed = false;

    (async () => {
      setupWorkerEnv();
      setupJsLanguageOnce();

      // 先等 Shiki 就绪（失败也会 resolve(false)，回退内置主题）
      shikiOk = await ensureShiki();

      // await 期间可能已卸载或已被其它路径创建
      if (disposed || !container || editor) return;

      const ed = monaco.editor.create(container, {
        value: store.content,
        language: store.language,
        theme: themeName(),
        "semanticHighlighting.enabled": true,
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

      store.attachEditor(ed);

      // 跟随 tailwind 的 dark class 切换主题（响应式主题）
      themeObserver = new MutationObserver(() => {
        monaco.editor.setTheme(themeName());
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });

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

      // 赋值放最后：editor 一旦响应式就绪，各同步 effect 立即以 store 当前值收敛
      editor = ed;
    })();

    return () => {
      disposed = true;
    };
  });

  // ── store → 编辑器 单向同步（load/reload 完成后覆盖内容）──
  $effect(() => {
    const next = store.content;
    if (!editor) return;
    if (editor.getValue() === next) return;
    syncingFromStore = true;
    editor.setValue(next);
    syncingFromStore = false;
  });

  // ── 语言切换同步：只切 model 语言；主题由亮/暗决定，不随语言变 ──
  $effect(() => {
    const lang = store.language;
    if (!editor) return;
    const model = editor.getModel();
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
      themeObserver?.disconnect();
      themeObserver = null;
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
