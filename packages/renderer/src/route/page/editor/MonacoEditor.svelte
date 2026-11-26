<!-- src/lib/editor/MonacoEditor.svelte -->
<!-- Monaco挂载点：容器常驻 DOM，Skeleton/遮罩为覆盖层，避免重建时创建时序错乱。 -->
<!-- 全部语言（js/json/markdown）使用 @shikijs/monaco 提供 TextMate 级高亮；-->
<!-- 主题走Shiki（亮/暗两套），跟随 <html> 的 dark class 响应 tailwind 主题。       -->
<!-- 用户自定义配色（VS Code/TextMate 主题 JSON）作为 Shiki 主题加载，替换内置亮/暗主题。-->
<!-- 注意：Shiki 只接管"语法高亮"，校验/格式化/补全等语言服务仍由 Monaco worker 提供。 -->
<!-- Monaco 核心及 Workers 均为动态导入，避免打入首屏主包。 -->
<!-- 动态导入不得使用 @vite-ignore：会让 Vite 跳过 chunk 拆分与 ?worker 处理， -->
<!-- 运行时裸模块无法解析，导致整个初始化链在第一个 await 处静默中断。          -->
<script lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any */

  import { Skeleton } from "$lib/components/ui/skeleton";
  import { configStore } from "$lib/store/config.svelte";
  import { safeApi } from "$lib/utils/api";
  import Logger from "electron-log/renderer";
  import { getErrorMessage } from "radashi";
  import { getExtraLib } from "./libs";
  import { editorStore as store } from "./store.svelte";
// ── 类型仅用于编译期，不参与运行时打包 ──
  import type * as monacoTypes from "monaco-editor";

  // 内置亮/暗 Shiki 主题（无自定义时使用）
  const THEME_DARK = "vitesse-dark";
  const THEME_LIGHT = "vitesse-light";
  // 自定义主题在 Shiki 中注册用的固定名（覆盖原 JSON 的 name，保证 setTheme 有稳定 id）
  const CUSTOM_DARK_NAME = "user-dark";
  const CUSTOM_LIGHT_NAME = "user-light";
  // Shiki 接管这些语言的语法高亮（token 上色）
  const SHIKI_LANGS = ["javascript", "json", "markdown"] as const;
  // Shiki 初始化失败时的内置回退主题
  const FALLBACK_DARK = "vs-dark";
  const FALLBACK_LIGHT = "vs";

  // Shiki 实际解析出的亮/暗主题名（快照一次；有自定义则为 user-*，否则为 vitesse-*）
  let darkThemeName = THEME_DARK;
  let lightThemeName = THEME_LIGHT;

  /**
   * Monaco 通过动态 import 加载，命名空间不会挂到 window。
   * setModelLanguage 等静态 API 必须通过这个引用调用，
   * 原实现试图读 (self as any).monaco，永远为 undefined，语言切换实际失效。
   */
  let monacoRef: typeof monacoTypes | null = null;

  let container = $state<HTMLDivElement | null>(null);
  let editor = $state.raw<monacoTypes.editor.IStandaloneCodeEditor | null>(
    null,
  );
  /** 防止内部 setValue 与外部同步互相触发 */
  let syncingFromStore = false;
  /** 递增序号：容器重建/组件销毁时让迟到的异步创建失效 */
  let createSeq = 0;

  let createError = $state<string | null>(null);

  /**
   * 动态设置 Monaco Worker 环境。
   * 用 Promise 缓存，保证多个编辑器实例并发初始化时不重复创建，
   * 也避免前一个 await 尚未完成时后一个直接读到不完整的 MonacoEnvironment。
   */
  function setupWorkerEnv(): Promise<void> {
    const g = self as any;
    if (g.__monacoEnvPromise) return g.__monacoEnvPromise;

    g.__monacoEnvPromise = (async () => {
      const [
        { default: EditorWorker },
        { default: JsonWorker },
        { default: TsWorker },
      ] = await Promise.all([
        import("monaco-editor/esm/vs/editor/editor.worker?worker"),
        import("monaco-editor/esm/vs/language/json/json.worker?worker"),
        import("monaco-editor/esm/vs/language/typescript/ts.worker?worker"),
      ]);

      // self.MonacoEnvironment 的类型不在 lib.dom 里，这里用 any 绕开
      (g as any).MonacoEnvironment = {
        getWorker(_: unknown, label: string) {
          if (label === "json") return new JsonWorker();
          if (label === "typescript" || label === "javascript")
            return new TsWorker();
          return new EditorWorker();
        },
      };
    })();

    return g.__monacoEnvPromise;
  }

  function isDark() {
    return (
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
    );
  }

  // 当前主题：名字在 ensureShiki 解析时已含回退，这里只按亮/暗选
  function themeName() {
    return isDark() ? darkThemeName : lightThemeName;
  }

  // 把用户自定义主题（响应式 state）解包为纯 JSON，并强制固定 name；无则返回 null
  function toShikiTheme(raw: unknown, name: string): any | null {
    if (!raw) return null;
    // $state.snapshot：把响应式代理转为纯对象，避免把 proxy 交给 Shiki
    const src = $state.snapshot(raw) as any;
    return { ...src, name };
  }

  function getheme(content: string | null) {
    if (!content) {
      return null;
    }
    try {
      return JSON.parse(content);
    } catch (e) {
      Logger.warn(
        "加载配置的编辑器主题出错:",
        e instanceof Error ? e.message : String(e),
      );
      return null;
    }
  }

  //── Shiki → Monaco：全局单例；解析结果随 promise 返回，避免竞态旁路 ──
  // monaco 命名空间由调用方传入，避免此函数内部再持有一份静态引用
  function ensureShiki(monaco: typeof monacoTypes): Promise<{
    ok: boolean;
    dark: string;
    light: string;
  }> {
    const g = self as any;
    if (g.__shikiSetup) return g.__shikiSetup;

    g.__shikiSetup = (async () => {
      const nameOf = (s: any) => (typeof s === "string" ? s : s.name);
      try {
        const { shikiToMonaco } = await import("@shikijs/monaco");
        const { createHighlighter } = await import("shiki");

        const themeInfo = await safeApi().config.getTheme();
        const darkCustom = toShikiTheme(
          getheme(themeInfo.dark),
          CUSTOM_DARK_NAME,
        );
        const lightCustom = toShikiTheme(
          getheme(themeInfo.light),
          CUSTOM_LIGHT_NAME,
        );
        const darkSrc = darkCustom ?? THEME_DARK;
        const lightSrc = lightCustom ?? THEME_LIGHT;

        let highlighter: Awaited<ReturnType<typeof createHighlighter>>;
        let dark: string;
        let light: string;
        try {
          highlighter = await createHighlighter({
            themes: [darkSrc, lightSrc],
            langs: [...SHIKI_LANGS],
          });
          dark = nameOf(darkSrc);
          light = nameOf(lightSrc);
        } catch (e) {
          // 稳定优先：自定义主题非法会连累整体高亮 —— 退回纯内置主题重建
          Logger.error(
            "[MonacoEditor] custom theme load failed, fallback to builtin Shiki themes:",
            e,
          );
          highlighter = await createHighlighter({
            themes: [THEME_DARK, THEME_LIGHT],
            langs: [...SHIKI_LANGS],
          });
          dark = THEME_DARK;
          light = THEME_LIGHT;
        }

        // 只有已注册的 languageId 才会被 Shiki 高亮（monaco通常已内置，这里兜底）
        const registered = new Set(
          monaco.languages.getLanguages().map((l) => l.id),
        );
        for (const id of SHIKI_LANGS) {
          if (!registered.has(id)) monaco.languages.register({ id });
        }

        // 接管语法高亮，并注册 Shiki 主题（此后 setTheme 只能用已注册主题名）
        shikiToMonaco(highlighter, monaco);
        return { ok: true, dark, light };
      } catch (e) {
        // 稳定优先：Shiki 整体失败也不阻断编辑器，回退 Monaco 内置主题
        Logger.error(
          "[MonacoEditor] Shiki init failed, fallback to builtin theme:",
          e,
        );
        return { ok: false, dark: FALLBACK_DARK, light: FALLBACK_LIGHT };
      }
    })();

    return g.__shikiSetup;
  }

  type CompleteInfo = {
    JS_COMPLETIONS: {
      label: string;
      insertText: string;
      detail: string;
      documentation: string;
    }[];
    NODE_AND_CUSTOM_DTS: string | null;
  };

  function setupJsLanguageOnce(
    monaco: typeof monacoTypes,
    comfiles: CompleteInfo,
  ) {
    if ((self as any).__jsLangReady) return;

    const ts = monaco.typescript;
    const js = ts.javascriptDefaults;

    js.setCompilerOptions({
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Classic,
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
        1108, // 'return' can only be used within a function body
      ],
    });

    const extraLibs = getExtraLib();
    extraLibs.forEach((lib) => {
      js.addExtraLib(lib.content, `ts:filename/${lib.name}.d.ts`);
    });

    if (comfiles.NODE_AND_CUSTOM_DTS) {
      js.addExtraLib(comfiles.NODE_AND_CUSTOM_DTS, "ts:filename/globals.d.ts");
    }

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
        const suggestions = comfiles.JS_COMPLETIONS.map((c) => ({
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

  let completeFilesPromise: Promise<CompleteInfo> | null = null;

  /**
   * 补全/类型文件加载失败不应当阻断编辑器创建。
   * 原实现把 readData 直接放进 Promise.all 且 create 流程无 try/catch，
   * 任一读盘失败都会让整个初始化链 reject，
   * 在懒加载场景下表现为“编辑器区域一直空白、无任何报错”。
   */
  function loadCompleteFiles(): Promise<CompleteInfo> {
    if (completeFilesPromise) return completeFilesPromise;

    completeFilesPromise = (async () => {
      const results = await Promise.all([
        safeApi()
          .config.readData("completes.json")
          .catch((e) => {
            Logger.warn(
              `[MonacoEditor] 读取 completes.json 失败：${getErrorMessage(e)}`,
            );
            return null;
          }),
        safeApi()
          .config.readData("global.d.ts.txt")
          .catch((e) => {
            Logger.warn(
              `[MonacoEditor] 读取 global.d.ts.txt 失败：${getErrorMessage(e)}`,
            );
            return null;
          }),
      ]);

      const completeStr = results[0] ?? null;
      const NODE_AND_CUSTOM_DTS = results[1] ?? null;

      let JS_COMPLETIONS: CompleteInfo["JS_COMPLETIONS"] = [];
      try {
        if (completeStr) {
          const parsed = JSON.parse(completeStr);
          if (Array.isArray(parsed)) JS_COMPLETIONS = parsed;
        }
      } catch (e) {
        Logger.warn(
          `[MonacoEditor] 解析 completes.json 失败：${getErrorMessage(e)}`,
        );
      }

      return { JS_COMPLETIONS, NODE_AND_CUSTOM_DTS };
    })();

    return completeFilesPromise;
  }

  //── 创建编辑器：Monaco 核心动态加载，与 store.loading 解耦 ──
  $effect(() => {
    const el = container;
    if (!el) return;

    const seq = ++createSeq;
    let disposed = false;
    let localEditor: monacoTypes.editor.IStandaloneCodeEditor | null = null;
    let localThemeObserver: MutationObserver | null = null;

    (async () => {
      // Logger.debug("[MonacoEditor] creating editor", { seq });

      // 1. 动态加载 Monaco 核心（首次 await 即触发 chunk 拉取）
      const monaco = await import("monaco-editor");
      if (disposed || seq !== createSeq) return;
      monacoRef = monaco;
      // Logger.debug("[MonacoEditor] monaco core loaded", { seq });

      // 2. Worker 环境必须在 create 之前就绪；失败也不阻断（Monaco 可回退主线程）
      try {
        await setupWorkerEnv();
      } catch (e) {
        Logger.warn(
          "[MonacoEditor] worker setup failed, fallback to main thread",
          e,
        );
      }
      if (disposed || seq !== createSeq) return;

      // 3. 加载补全数据 & 配置 JS 语言服务
      const comfiles = await loadCompleteFiles();
      if (disposed || seq !== createSeq) return;
      setupJsLanguageOnce(monaco, comfiles);

      // 4. 等 Shiki 就绪（失败也会 resolve，回退内置主题）
      const shiki = await ensureShiki(monaco);
      if (disposed || seq !== createSeq) return;
      darkThemeName = shiki.dark;
      lightThemeName = shiki.light;
      // Logger.debug("[MonacoEditor] shiki ready", {
      //   seq,
      //   ok: shiki.ok,
      //   dark: shiki.dark,
      //   light: shiki.light,
      // });

      // 5. 创建编辑器
      const ed = monaco.editor.create(el, {
        value: store.content,
        language: store.language,
        suggest: {
          showModules: false,
        },
        theme: themeName(),
        "semanticHighlighting.enabled": true,
        automaticLayout: true,
        fontSize: configStore.fontSize,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
        lineHeight: configStore.lineHeight,
        padding: { top: 12, bottom: 12 },
        minimap: { enabled: store.minimap },
        wordWrap: store.wordWrap ? "on" : "off",
        lineNumbers: configStore.lineNumbers ? "on" : "off",
        renderLineHighlight: "all",
        smoothScrolling: true,
        cursorSmoothCaretAnimation: "on",
        scrollBeyondLastLine: false,
        fixedOverflowWidgets: true,
        scrollbar: { vertical: "auto", horizontal: "auto", useShadows: false },
        readOnly: store.readonly,
      });

      localEditor = ed;
      store.attachEditor(ed);

      // 跟随 tailwind 的 dark class 切换主题（响应式主题）
      localThemeObserver = new MutationObserver(() => {
        monaco.editor.setTheme(themeName());
      });
      localThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });

      //── 内容变更：同步给 store，并触发路径资产重新扫描 ──
      ed.onDidChangeModelContent(() => {
        if (syncingFromStore) return;
        const next = ed.getValue();
        store.content = next;
        store.onContentChanged(next);
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
        void store.save();
      });

      createError = null;
      // 赋值放最后：editor 一旦响应式就绪，各同步 effect 立即以 store 当前值收敛
      editor = ed;
      // Logger.debug("[MonacoEditor] editor created", {
      //   seq,
      //   language: store.language,
      //   length: store.content.length,
      // });
    })().catch((err) => {
      if (disposed || seq !== createSeq) return;
      createError = getErrorMessage(err);
      Logger.error("[MonacoEditor] create failed", err);
    });

    /*
     * 清理只在本 effect 的依赖（container）变化或组件卸载时执行。
     * 原实现把创建放在一个读取 `editor` 的 $effect 中，editor 赋值后
     * effect 重跑会丢掉 cleanup，导致编辑器/model/observer 永不释放。
     */
    return () => {
      disposed = true;
      localThemeObserver?.disconnect();
      localThemeObserver = null;

      if (localEditor) {
        store.detachEditor(localEditor);
        localEditor.dispose();
        localEditor = null;
      }

      editor = null;
      Logger.debug("[MonacoEditor] disposed", { seq });
    };
  });

  // ── store → 编辑器单向同步（load/reload完成后覆盖内容）──
  $effect(() => {
    const next = store.content;
    const ed = editor;
    if (!ed) return;
    if (ed.getValue() === next) return;

    syncingFromStore = true;
    try {
      ed.setValue(next);
    } finally {
      syncingFromStore = false;
    }
  });

  // ── 语言切换同步：只切 model 语言；主题由亮/暗决定，不随语言变──
  $effect(() => {
    const lang = store.language;
    const ed = editor;
    const monaco = monacoRef;
    if (!ed || !monaco) return;

    const model = ed.getModel();
    if (model && model.getLanguageId() !== lang) {
      monaco.editor.setModelLanguage(model, lang);
    }
  });

  // ── 只读态同步 ──
  $effect(() => {
    const editable = !store.readonly;
    editor?.updateOptions({ readOnly: !editable });
  });

  // ── 换行 / 小地图开关同步 ──
  $effect(() => {
    editor?.updateOptions({
      wordWrap: store.wordWrap ? "on" : "off",
      minimap: { enabled: store.minimap },
    });
  });
</script>

<div class="absolute inset-0">
  <!-- 容器常驻：不再被 {#if loading} 包裹，重建即创建 -->
  <div
    bind:this={container}
    class="absolute inset-0 {store.readonly ? 'pointer-events-none' : ''}"
  ></div>

  <!-- 初始化失败提示（z-30，压过 loading / busy 遮罩） -->
  {#if createError}
    <div
      class="absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-6 backdrop-blur-[1px] animate-fade-in"
    >
      <div
        class="max-w-md space-y-2 rounded-xl border border-border/50 bg-card px-6 py-4 text-center shadow-xl"
      >
        <p class="text-sm font-medium text-destructive">编辑器初始化失败</p>
        <p class="break-all font-mono text-xs text-muted-foreground">
          {createError}
        </p>
      </div>
    </div>
  {/if}

  <!-- 加载态：覆盖层，盖在容器之上 -->
  {#if store.loading}
    <div
      class="absolute inset-0 z-20 flex gap-4 bg-background p-4 animate-fade-in"
    >
      <div class="flex w-10 shrink-0 flex-col gap-3 pt-1">
        {#each Array(18) as _, i (i)}<Skeleton class="h-4 w-6 rounded-lg" />
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

  <!-- 异步动作遮罩（保存 / 重新加载） -->
  {#if store.busy}
    <div
      class="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[1px] animate-fade-in"
    >
      <div
        class="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-6 py-3 shadow-xl"
      >
        <span class="size-2 animate-pulse rounded-full bg-primary"></span>
        <span class="text-sm text-foreground">
          {store.busyAction === "save" ? "正在保存…" : "正在重新加载…"}
        </span>
      </div>
    </div>
  {/if}
</div>
