<!-- $lib/components/panels/SettingsPanel.svelte -->
<script lang="ts">
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Separator } from "$lib/components/ui/separator";
  import { longTaskStore } from "$lib/store/ui/longTask.svelte";
  import { PinyinFuseSearch } from "$lib/utils/fuse";
  import autoAnimate from "@formkit/auto-animate";
  import { location, push } from "@keenmate/svelte-spa-router";
  import {
    IconBooks,
    IconBrain,
    IconChevronDown,
    IconCloud,
    IconCodePlus,
    IconDeviceDesktopCog,
    IconFolders,
    IconKeyboard,
    IconPlayHandball,
    IconPlugConnected,
    IconServer2,
    IconSettings,
    IconSettingsOff,
    IconSparkles,
    IconTerminal2,
  } from "@tabler/icons-svelte";
  import { debounce } from "radashi";
  import { settingsPanelStore } from "./settingStore.svelte";

  /* ------------------------------------------------------------------ */
  /*  Types                                                              */
  /* ------------------------------------------------------------------ */

  type SettingsNavItem = {
    id: string;
    label: string;
    description: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any;
    /** 路由路径片段，拼接为 /settings/{path} */
    path: string;
    keywords?: string[];
    /**
     * 长时任务角标 key —— 对应 LongTaskStore 注册的 key。
     * 存在时该条目右上角渲染角标；未注册 / 计数为 0 时不渲染。
     */
    longTaskKey?: string;
  };

  type SettingsGroup = {
    id: string;
    label: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any;
    items: SettingsNavItem[];
  };

  /* ------------------------------------------------------------------ */
  /*  Constants — Route Prefix                                           */
  /* ------------------------------------------------------------------ */

  const SETTINGS_BASE = "/settings";

  /* ------------------------------------------------------------------ */
  /*  Navigation Data (static, never mutated)                            */
  /* ------------------------------------------------------------------ */

  /**
   * 设计说明：
   *  · "模型"作为顶级条目，涵盖 LLM / 图像 / 音频 / 视频等所有 AIGC 模型配置。
   *  · "API 管理"下保留 search 与 mcp 两个并列入口，二者职责独立：
   *      - search：出站能力（联网搜索 API Key / 搜索引擎配置）
   *      - mcp   ：入站能力（Model Context Protocol 服务器注册）
   *  · "环境"分组承载"让 AI 跑起来 / 跑得动"相关配置：
   *      - code-runtime：AI 代码执行能力（Python / Node.js 独立环境）
   *      - sandbox     ：AI 代码执行能力（云端沙盒，隔离本机环境）
   *      - environments：本机或 SSH 的自有环境（llama.cpp、嵌入模型等）
   *    之所以独立成一级分组而非塞入"常规"：三者都是 AI 能力的基础设施，
   *    语义距离近，且未来很可能再扩展（算力调度、GPU 池等）。
   */
  const builtinGroups: SettingsGroup[] = [
    {
      id: "general",
      label: "常规",
      icon: IconSettings,
      items: [
        {
          id: "general-main",
          label: "常规",
          description: "语言、搜索设置、数据备份",
          icon: IconSettings,
          path: "general",
          // 由 App.svelte 注册的 "search:" 前缀汇总（全文索引重建 / 向量重建）
          longTaskKey: "search",
          keywords: [
            "通用",
            "常规",
            "语言",
            "language",
            "locale",
            "嵌入",
            "embedding",
            "全文检索",
            "fts",
            "分词",
            "tokenizer",
            "备份",
            "导入",
            "导出",
            "版本",
          ],
        },
        {
          id: "keybindings",
          label: "快捷键",
          description: "自定义键盘绑定",
          icon: IconKeyboard,
          path: "keybindings",
          keywords: ["shortcut", "热键", "绑定", "快捷方式"],
        },
        {
          id: "project-types",
          label: "项目类型",
          description: "管理可用项目类型",
          icon: IconFolders,
          path: "projectype",
          keywords: ["project-type", "项目类型", "项目模板"],
        },
        {
          id: "develops",
          label: "开发(普通用户忽略)",
          description: "管理AI的内存与动态代码",
          icon: IconCodePlus,
          path: "develops",
          keywords: ["开发", "监督", "审查", "AI协同"],
        },
      ],
    },
    {
      id: "runtime",
      label: "环境",
      icon: IconDeviceDesktopCog,
      items: [
        {
          id: "models-all",
          label: "AIGC 模型",
          description: "管理可使用的AI模型",
          icon: IconBrain,
          path: "models/llm",
          keywords: [
            "模型",
            "model",
            "LLM",
            "GPT",
            "Claude",
            "对话",
            "文本生成",
            "推理",
            "thinking",
            "DALL-E",
            "Stable Diffusion",
            "Midjourney",
            "Flux",
            "通义万相",
            "图片",
            "生图",
            "绘图",
            "识图",
            "看图",
            "多模态",
            "Vision",
            "video",
            "视频生成",
            "Sora",
            "动画",
            "文生视频",
            "图生视频",
            "Kling",
            "快手可灵",
            "Hunyuan-Video",
            "Wan2.1",
            "audio",
            "语音",
            "音乐",
            "音效",
            "TTS",
            "文本转语音",
            "语音识别",
            "ASR",
            "声音克隆",
            "Suno",
            "Udio",
            "ElevenLabs",
          ],
        },
        {
          id: "environments",
          label: "自有算力",
          description: "自有设备做推理及训练",
          icon: IconServer2,
          path: "environments",
          // 由 environments store 模块底部注册（参见 LongTaskStore.register）
          longTaskKey: "environments",
          keywords: [
            "环境",
            "environment",
            "ssh",
            "远端",
            "remote",
            "llama.cpp",
            "推理",
            "embeddings",
            "嵌入模型",
            "本地模型",
            "self-host",
          ],
        },
        {
          id: "code-runtime",
          label: "本机工具",
          description: "管理AI可使用的本机工具",
          icon: IconTerminal2,
          path: "code-runtime",
          // 由 App.svelte 注册的 "code-runtime:" 前缀汇总
          longTaskKey: "code-runtime",
          keywords: [
            "code",
            "runtime",
            "python",
            "node",
            "nodejs",
            "脚本",
            "执行",
            "代码",
            "数据分析",
            "pandas",
            "excel",
            "csv",
            "脚本沙箱",
          ],
        },
        {
          id: "sandbox",
          label: "云端主机",
          description: "AI自主维护SSH云主机",
          icon: IconCloud,
          path: "sandbox",
          keywords: ["sandbox", "cloud", "云", "云端", "隔离", "远程", "code"],
        },
      ],
    },
    {
      id: "api",
      label: "AI 能力",
      icon: IconPlayHandball,
      items: [
        {
          id: "api-mcp",
          label: "MCP",
          description: "管理AI的可用工具",
          icon: IconPlugConnected,
          path: "api/mcp",
          keywords: ["MCP", "tool", "插件", "function calling"],
        },
        {
          id: "api-skill",
          label: "技能",
          description: "管理AI做事的方法",
          icon: IconSparkles,
          path: "api/skill",
          keywords: ["rag", "skill", "tool", "技能", "function calling"],
        },
        {
          id: "api-knowlege",
          label: "知识库",
          description: "维护个人偏好及专属资料",
          icon: IconBooks,
          path: "api/kb",
          keywords: [
            "rag",
            "knowlegeBase",
            "knowlege",
            "tool",
            "知识库",
            "function calling",
          ],
        },
      ],
    },
  ];

  /* ------------------------------------------------------------------ */
  /*  Search — PinyinFuseSearch                                          */
  /* ------------------------------------------------------------------ */

  const searchItems = builtinGroups.flatMap((g) =>
    g.items.map((item) => ({
      id: item.id,
      text: [item.label, item.description, g.label, ...(item.keywords ?? [])]
        .filter(Boolean)
        .join(" "),
    })),
  );

  const fuseSearch = new PinyinFuseSearch(searchItems, {
    keys: [
      { name: "text", weight: 1.0 },
      { name: "_fullPinyin", weight: 0.5 },
      { name: "_firstLetters", weight: 0.3 },
    ],
    threshold: 0.3,
  });

  /* ------------------------------------------------------------------ */
  /*  State                                                              */
  /* ------------------------------------------------------------------ */

  let openGroups = $state<Record<string, boolean>>({
    general: true,
    models: true,
    api: true,
    runtime: true,
  });

  let debouncedQuery = $state("");

  const applyDebouncedQuery = debounce({ delay: 200 }, (q: string) => {
    debouncedQuery = q;
  });

  $effect(() => {
    applyDebouncedQuery(settingsPanelStore.searchQuery);
    return () => applyDebouncedQuery.cancel();
  });

  /* ------------------------------------------------------------------ */
  /*  Utilities                                                          */
  /* ------------------------------------------------------------------ */

  function formatBadge(n: number): string | null {
    if (!Number.isFinite(n) || n <= 0) return null;
    return n > 99 ? "99+" : String(n);
  }

  /* ------------------------------------------------------------------ */
  /*  Derived — Route-based active state                                 */
  /* ------------------------------------------------------------------ */

  const currentLocation = $derived(location());

  let activePath = $derived.by((): string => {
    const loc = currentLocation;
    if (loc.startsWith(SETTINGS_BASE + "/")) {
      return loc.slice(SETTINGS_BASE.length + 1);
    }
    if (loc === SETTINGS_BASE) {
      return builtinGroups[0].items[0].path;
    }
    return "";
  });

  let activeGroupId = $derived(
    builtinGroups.find((g) => g.items.some((i) => i.path === activePath))?.id ??
      "",
  );

  let hasSearch = $derived(debouncedQuery.trim().length > 0);

  let matchedIds = $derived.by((): Set<string | number> | null => {
    const q = debouncedQuery.trim();
    if (!q) return null;
    return new Set(fuseSearch.search(q));
  });

  let filteredGroups = $derived.by((): SettingsGroup[] => {
    if (!matchedIds) return builtinGroups;
    return builtinGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((item) => matchedIds!.has(item.id)),
      }))
      .filter((g) => g.items.length > 0);
  });

  /* ------------------------------------------------------------------ */
  /*  Navigation handler                                                 */
  /* ------------------------------------------------------------------ */

  function navigateTo(path: string) {
    push(`${SETTINGS_BASE}/${path}`);
  }
</script>

<div class="flex h-full flex-col">
  <nav class="flex-1 overflow-y-auto px-3 py-3" use:autoAnimate>
    {#each filteredGroups as group, gi (group.id)}
      {@const GroupIcon = group.icon}
      {@const isOpen = hasSearch || (openGroups[group.id] ?? true)}
      {@const isGroupActive = activeGroupId === group.id}

      {#if gi > 0}
        <div class="px-2 py-2">
          <Separator class="bg-border/40" />
        </div>
      {/if}

      <Collapsible.Root
        open={isOpen}
        onOpenChange={(v) => {
          if (!hasSearch) openGroups[group.id] = v;
        }}
      >
        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → SettingsGroupHeader.svelte]         │ -->
        <!-- │ 职责：可折叠分组标题行，含图标、标签、计数与箭头    │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <Collapsible.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class={[
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                "hover:bg-accent/60",
                isGroupActive && !isOpen ? "bg-accent/30" : "bg-transparent",
              ]}
            >
              <div
                class={[
                  "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-200",
                  isGroupActive
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-foreground",
                ]}
              >
                <GroupIcon size={18} stroke={1.5} />
              </div>

              <span
                class="flex-1 text-left text-sm font-medium tracking-tight text-foreground"
              >
                {group.label}
              </span>

              <div class="flex items-center gap-2">
                {#if !isOpen}
                  <span
                    class="inline-flex h-5 min-w-5 items-center justify-center rounded-lg bg-muted px-1.5 text-xs tabular-nums text-muted-foreground transition-all duration-200"
                  >
                    {group.items.length}
                  </span>
                {/if}

                <div
                  class="flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 group-hover:bg-accent"
                >
                  <IconChevronDown
                    class="size-3.5 text-muted-foreground transition-transform duration-200 {!isOpen
                      ? '-rotate-90'
                      : ''}"
                    stroke={1.5}
                  />
                </div>
              </div>
            </button>
          {/snippet}
        </Collapsible.Trigger>
        <!-- ╭─── / SettingsGroupHeader ───╮ -->

        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → SettingsNavItemList.svelte]         │ -->
        <!-- │ 职责：分组内导航条目列表，路由驱动 active 高亮      │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <Collapsible.Content>
          <div class="mt-1 space-y-0.5 pb-1" use:autoAnimate>
            {#each group.items as item (item.id)}
              {@const isActive = activePath === item.path}
              {@const Icon = item.icon}
              {@const longTaskBadge = item.longTaskKey
                ? formatBadge(longTaskStore.countFor(item.longTaskKey))
                : null}

              <button
                class={[
                  "relative flex w-full items-center gap-3 rounded-xl py-2.5 pl-16 pr-3 text-left transition-all duration-200",
                  isActive
                    ? "bg-primary/8 text-foreground"
                    : "text-foreground/70 hover:bg-accent/40 hover:text-foreground",
                ]}
                id="settings-{item.id}"
                aria-current={isActive ? "page" : undefined}
                onclick={() => navigateTo(item.path)}
              >
                {#if isActive}
                  <span
                    class="absolute left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-all duration-200"
                  ></span>
                {/if}

                <Icon
                  class={[
                    "size-4 shrink-0 transition-colors duration-200",
                    isActive ? "text-primary" : "text-muted-foreground",
                  ]}
                  stroke={1.5}
                />

                <div class="flex min-w-0 flex-1 flex-col">
                  <div class="flex items-center gap-2">
                    <span
                      class={[
                        "truncate text-sm transition-colors duration-200",
                        isActive ? "font-medium" : "font-normal",
                      ]}
                    >
                      {item.label}
                    </span>
                    {#if longTaskBadge}
                      <span
                        class="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground tabular-nums"
                        aria-label={`${longTaskBadge} 个长时任务进行中`}
                      >
                        {longTaskBadge}
                      </span>
                    {/if}
                  </div>
                  <span
                    class={[
                      "truncate text-xs transition-colors duration-200",
                      isActive ? "text-primary/60" : "text-muted-foreground/70",
                    ]}
                  >
                    {item.description}
                  </span>
                </div>
              </button>
            {/each}
          </div>
        </Collapsible.Content>
        <!-- ╭─── / SettingsNavItemList ───╮ -->
      </Collapsible.Root>
    {/each}

    {#if filteredGroups.length === 0}
      <div
        class="flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-in"
      >
        <div
          class="flex size-12 items-center justify-center rounded-2xl bg-muted"
        >
          <IconSettingsOff class="size-5 text-muted-foreground" stroke={1.5} />
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">未找到匹配的设置项</p>
          <p class="text-xs text-muted-foreground">尝试使用其他关键词搜索</p>
        </div>
      </div>
    {/if}
  </nav>
</div>
