<!-- src/lib/editor/EditorPage.svelte -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import Logger from "electron-log/renderer";
  import { untrack, type Component } from "svelte";
  import EditorToolbar from "./EditorToolbar.svelte";
  import {
    editorStore,
    type BlueprintKind,
    type CntParam,
  } from "./store.svelte";

  /**
   * 路由参数来源（按优先级合并）：
   *
   *   1. `routeParams` —— @keenmate/svelte-spa-router 的官方传参 prop：
   *      let { routeParams = {} } = $props()
   *      （旧 API 与部分包装器用 `params`，保留兼容）
   *   2. 平铺 props：kind / id / name / content / contentFmt
   *   3. window.location.hash（最后兜底）
   *
   * 历史故障：本组件只解构 `params`，而当前路由库传的是 `routeParams`，
   * 于是 id 恒为 ''，store 以空 id 加载，标题显示 untitled.json，
   * 编辑器打开的是空文件而不是被点击的条目。
   */
  type RouteParamBag = {
    kind?: string;
    id?: string;
    name?: string;
    content?: string;
    contentFmt?: string;
    fmt?: string;
  };

  let {
    routeParams: routeParamsProp,
    params,
    kind: kindProp,
    id: idProp,
    name: nameProp,
    content: contentProp,
    contentFmt: contentFmtProp,
  }: {
    routeParams?: RouteParamBag;
    params?: RouteParamBag;
    kind?: string;
    id?: string;
    name?: string;
    content?: string;
    contentFmt?: string;
  } = $props();

  /** contentFmt 只接受已知取值，其余（含路由尾斜杠产生的空串）一律视为无格式 */
  const VALID_CONTENT_FMTS = new Set<string>(["markdown", "json", "js", "new"]);

  function normalizeContentFmt(raw: unknown): CntParam {
    if (typeof raw !== "string") return "";
    const v = raw.trim().toLowerCase();
    return VALID_CONTENT_FMTS.has(v) ? (v as CntParam) : "";
  }

  function normalizeKind(raw: unknown): BlueprintKind {
    return raw === "metag" || raw === "capa" ? raw : "glossary";
  }

  /**
   * 从 location.hash 解析编辑器路由参数。
   * 形如： #/editor/{kind}/{id}/{content?}
   * 兼容末尾斜杠、query 串以及 URL 编码的 id（名称可能含 # / 空格等）。
   */
  function parseEditorHash(rawHash: string): RouteParamBag | null {
    const raw = rawHash.replace(/^#/, "").split("?")[0];
    const segs = raw.split("/").filter((s) => s.length > 0);

    // 至少需要 editor / kind / id 三段
    if (segs[0] !== "editor" || !segs[1] || !segs[2]) return null;

    let id = segs[2];
    try {
      id = decodeURIComponent(id);
    } catch {
      /* 畸形编码：保留原始值，不阻断打开 */
    }

    return { kind: segs[1], id, content: segs[3] ?? "" };
  }

  const propsRoute = $derived.by<RouteParamBag>(() => {
    const fromRoute: RouteParamBag = routeParamsProp ?? {};
    const fromParams: RouteParamBag = params ?? {};

    return {
      kind: fromRoute.kind ?? fromParams.kind ?? kindProp,
      // 参数名在不同路由定义下可能是 id / name；官方 prop、旧 prop、平铺都要覆盖
      id:
        fromRoute.id ??
        fromRoute.name ??
        fromParams.id ??
        fromParams.name ??
        idProp ??
        nameProp,
      content:
        fromRoute.content ??
        fromRoute.contentFmt ??
        fromRoute.fmt ??
        fromParams.content ??
        fromParams.contentFmt ??
        fromParams.fmt ??
        contentProp ??
        contentFmtProp,
    };
  });

  // 初始值直接取当前 hash：组件挂载时 hash 已是目标路由
  let hashRoute = $state<RouteParamBag | null>(
    typeof window === "undefined"
      ? null
      : parseEditorHash(window.location.hash),
  );

  $effect(() => {
    if (typeof window === "undefined") return;

    const onHashChange = () => {
      const next = parseEditorHash(window.location.hash);
      const prev = untrack(() => hashRoute);

      // 值未变化时不产生新对象，避免下游无意义的重算
      if (
        prev?.kind === next?.kind &&
        (prev?.id ?? "") === (next?.id ?? "") &&
        (prev?.content ?? "") === (next?.content ?? "")
      ) {
        return;
      }

      hashRoute = next;
      // Logger.debug("[EditorPage] hashchange", {
      //   hash: window.location.hash,
      //   next,
      // });
    };

    // 立即同步一次：组件可能被复用（未重建）而 hash 已经变了
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  });

  /**
   * 合并：props 非空则优先，否则用 hash 解析结果。
   * 空字符串与 undefined 一律视为“未提供”，避免 '' 挡住有效值。
   */
  const routeParams = $derived.by<RouteParamBag>(() => {
    const p = propsRoute;
    const h = hashRoute ?? {};

    const propKind = (p.kind ?? "").trim();
    const propId = (p.id ?? "").trim();
    const propContent = p.content ?? "";

    return {
      kind: propKind || h.kind,
      id: propId || (h.id ?? ""),
      content: propContent || (h.content ?? ""),
    };
  });

  const kind = $derived<BlueprintKind>(normalizeKind(routeParams.kind));

  $effect(() => {
    const snapshot = {
      kind,
      id: (routeParams.id ?? "").trim(),
      contentFmt: normalizeContentFmt(routeParams.content),
    };

    // Logger.debug("[EditorPage] route params", {
    //   snapshot,
    //   hash: typeof window !== "undefined" ? window.location.hash : "",
    //   /*
    //    * 完整 dump 一轮原始 props，便于确认路由层到底传了什么。
    //    * untrack 保证读原始 props 不给本 effect 增加额外依赖。
    //    */
    //   rawProps: untrack(() => ({
    //     routeParams: routeParamsProp == null ? null : { ...routeParamsProp },
    //     params: params == null ? null : { ...params },
    //     kind: kindProp,
    //     id: idProp,
    //     name: nameProp,
    //     content: contentProp,
    //     contentFmt: contentFmtProp,
    //   })),
    //   hashRoute: untrack(() => hashRoute),
    // });

    /*
     * init() 内部会读写 editorStore 的 $state。
     * 若不用 untrack 包住，这些读写会成为本 effect 的依赖，
     * 导致 store 每次变化都重新执行 init（脏依赖，容易产生竞态）。
     */
    untrack(() => {
      void editorStore.init(snapshot).catch((err) => {
        Logger.error("[EditorPage] editorStore.init failed", err);
      });
    });
  });

  // ── 编辑器懒加载 ──
  // 该界面使用频率低，MonacoEditor 及其静态依赖不应在应用启动时进入首屏 chunk。
  let LazyMonacoEditor = $state<Component | null>(null);
  let lazyError = $state<string | null>(null);

  $effect(() => {
    if (LazyMonacoEditor) return;

    let cancelled = false;

    void import("./MonacoEditor.svelte")
      .then((mod) => {
        if (cancelled) return;
        LazyMonacoEditor = mod.default as Component;
        // Logger.debug("[EditorPage] MonacoEditor chunk loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        lazyError = err instanceof Error ? err.message : String(err);
        Logger.error("[EditorPage] failed to load MonacoEditor chunk", err);
      });

    return () => {
      cancelled = true;
    };
  });
</script>

<div
  class="flex h-full w-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
>
  <EditorToolbar />

  <div class="relative min-h-0 flex-1">
    {#if LazyMonacoEditor}
      <LazyMonacoEditor />
    {:else if lazyError}
      <div class="flex h-full items-center justify-center p-6 text-center">
        <div class="space-y-2">
          <p class="text-sm font-medium text-destructive">编辑器加载失败</p>
          <p class="break-all font-mono text-xs text-muted-foreground">
            {lazyError}
          </p>
        </div>
      </div>
    {:else}
      <!-- MonacoEditor chunk 加载期间的占位，避免整块区域空白 -->
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
  </div>
</div>
