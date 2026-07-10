<script lang="ts">
  // ── Tabler Icons ──
  import {
    IconAlertTriangle,
    IconCircleCheck,
    IconFolder,
    IconMail,
  } from "@tabler/icons-svelte";
  import { router } from "svelte-spa-router";
// ── Stores ──
  import { configStore } from "$lib/store/config.svelte";
  import { pluginStore } from "$lib/store/plugin.svelte";
  import { projectStore } from "$lib/store/project.svelte";
// ── Sub-views ──
  import { safeApi } from "$lib/utils/api";
  import { onMount } from "svelte";
  import EditorStatusBar from "../page/editor/EditorStatusBar.svelte";
  import RunState from "../RunState.svelte";
  import Brand from "./header/brand.svelte";

  // ═══════════════════════════════════════════════════════════
  // App meta — 软件名 / 版本号 / 作者 / 联系邮箱
  // ═══════════════════════════════════════════════════════════
  const APP_NAME = "Unigen";
  let appVersion = $state<string>("0.0.0");

  const AUTHOR = "masol";
  const AUTHOR_EMAIL = "13501031450@163.com";

  onMount(async () => {
    appVersion = await safeApi().system.version();
  });

  // ═══════════════════════════════════════════════════════════
  // Location → 决定使用哪套状态栏
  // ═══════════════════════════════════════════════════════════
  const currentLocation = $derived(router.location);

  type StatusCompType = "normal" | "editor";

  const statusComp: StatusCompType = $derived.by(() => {
    return currentLocation.startsWith("/editor/") ? "editor" : "normal";
  });

  const hasProject = $derived(projectStore.path.length > 0);

  // ═══════════════════════════════════════════════════════════
  // Project path — 截断显示,保留尾部关键目录,悬停显示完整路径
  // ═══════════════════════════════════════════════════════════
  const displayPath = $derived.by(() => {
    const p = projectStore.path;
    if (!p) return "";
    // 统一分隔符,取末段作为主展示
    const segments = p.replace(/\\/g, "/").split("/").filter(Boolean);
    if (segments.length <= 2) return p;
    return `…/${segments.slice(-2).join("/")}`;
  });

  // ═══════════════════════════════════════════════════════════
  // Project type — 与新建项目页保持同一真相源(configStore + pluginStore)
  // ═══════════════════════════════════════════════════════════
  const projectTypes = $derived(
    pluginStore.projectPlugins.map((plugin) => ({
      value: plugin.id,
      label: plugin.name,
      note: plugin.description,
      icon: plugin.icon,
    })),
  );

  const currentProjectType = $derived(configStore.projectype ?? "video");

  const currentTypeMeta = $derived(
    projectTypes.find((t) => t.value === currentProjectType),
  );

  const currentTypeLabel = $derived(currentTypeMeta?.label ?? "未知类型");

  // ═══════════════════════════════════════════════════════════
  // Actions — 在资源管理器中定位项目目录 / 打开作者邮箱
  // ═══════════════════════════════════════════════════════════
  async function revealProjectInFolder() {
    if (!projectStore.path) return;
    await safeApi().system.showItemInFolder({ path: projectStore.path });
  }

  async function contactAuthor() {
    await safeApi().system.openExternal({
      url: `mailto:${AUTHOR_EMAIL}`,
    });
  }
</script>

<div
  class="flex h-6 shrink-0 items-center justify-between border-t border-border/50 bg-muted/40 px-3 text-xs text-muted-foreground select-none"
>
  {#if statusComp === "editor"}
    <EditorStatusBar />
  {:else if hasProject}
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → StatusBarProject.svelte]            │ -->
    <!-- │ 职责：有项目态状态栏 — 左路径(可定位),右类型/Brand   │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->

    <!-- 左侧：项目路径(点击资源管理器定位) + 告警 -->
    <div class="flex min-w-0 items-center gap-3">
      <button
        title={`在资源管理器中显示：${projectStore.path}`}
        onclick={revealProjectInFolder}
        class="flex min-w-0 items-center gap-1 text-xs text-muted-foreground transition-all duration-200 hover:text-foreground"
      >
        <IconFolder class="size-3.5 shrink-0" stroke={1.5} />
        <span class="truncate">{displayPath}</span>
      </button>
      <button
        class="flex items-center gap-1 text-xs text-muted-foreground transition-all duration-200 hover:text-foreground"
      >
        <IconAlertTriangle class="size-3.5" stroke={1.5} />
        <span>0</span>
      </button>
    </div>

    <!-- 右侧：项目类型 + Brand -->
    <div class="flex shrink-0 items-center gap-3">
      <button
        title={currentTypeMeta?.note ?? ""}
        class="flex items-center gap-1 text-xs text-muted-foreground transition-all duration-200 hover:text-foreground"
      >
        {#if currentTypeMeta?.icon}
          <currentTypeMeta.icon class="size-3.5" stroke={1.5} />
        {/if}
        <span>{currentTypeLabel}</span>
      </button>
      <RunState />
    </div>

    <!-- ╭─── / StatusBarProject ───╮ -->
  {:else}
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → StatusBarIdle.svelte]               │ -->
    <!-- │ 职责：无项目态 — 左软件名/版本,右作者(可邮件)/Brand  │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->

    <!-- 左侧：就绪状态 + 软件名 + 版本号 -->
    <div class="flex items-center gap-3">
      <span class="flex items-center gap-1 text-xs text-muted-foreground">
        <IconCircleCheck class="size-3.5" stroke={1.5} />
        <span>就绪</span>
      </span>
      <span class="text-xs font-medium text-foreground">{APP_NAME}</span>
      <span class="text-xs text-muted-foreground">v{appVersion}</span>
    </div>

    <!-- 右侧：作者(点击发邮件) + Brand -->
    <div class="flex items-center gap-3">
      <button
        title={`联系作者：${AUTHOR_EMAIL}`}
        onclick={contactAuthor}
        class="flex items-center gap-1 text-xs text-muted-foreground transition-all duration-200 hover:text-foreground"
      >
        <IconMail class="size-3.5" stroke={1.5} />
        <span>{AUTHOR}</span>
      </button>
      <Brand />
    </div>

    <!-- ╭─── / StatusBarIdle ───╮ -->
  {/if}
</div>
