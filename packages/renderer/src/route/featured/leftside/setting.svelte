<!-- $lib/components/panels/SettingsPanel.svelte -->
<script lang="ts">
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Separator } from "$lib/components/ui/separator";
  import { PinyinFuseSearch } from "$lib/utils/fuse";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconBrain,
    IconChevronDown,
    IconCode,
    IconCodePlus,
    IconDeviceSpeaker,
    IconKeyboard,
    IconPlug,
    IconRobot,
    IconSearch,
    IconSettings,
    IconSettingsOff,
    IconVideo,
  } from "@tabler/icons-svelte";
  import { debounce } from "radashi";
  import { push, router } from "svelte-spa-router";
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

  const builtinGroups: SettingsGroup[] = [
    {
      id: "general",
      label: "通用",
      icon: IconSettings,
      items: [
        {
          id: "general-main",
          label: "通用",
          description: "语言、本地模型、数据备份",
          icon: IconSettings,
          path: "general",
          keywords: [
            "语言",
            "language",
            "locale",
            "嵌入",
            "embedding",
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
          id: "develops",
          label: "开发",
          description: "AI工作流改进工具的设置(右侧面板)",
          icon: IconCodePlus,
          path: "develops",
          keywords: ["开发", "监督", "审查", "AI协同"],
        },
      ],
    },
    {
      id: "models",
      label: "模型管理",
      icon: IconBrain,
      items: [
        {
          id: "models-llm",
          label: "图文模型",
          description: "大语言及图像模型的配置与选择",
          icon: IconRobot,
          path: "models/llm",
          keywords: [
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
          ],
        },
        {
          id: "models-video",
          label: "视频模型",
          description: "视频生成与处理",
          icon: IconVideo,
          path: "models/video",
          keywords: [
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
          ],
        },
        {
          id: "models-audio",
          label: "音频模型",
          description: "语音、音乐及音效模型。",
          icon: IconDeviceSpeaker,
          path: "models/audio",
          keywords: [
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
      ],
    },
    {
      id: "api",
      label: "API 管理",
      icon: IconCode,
      items: [
        {
          id: "api-search",
          label: "搜索",
          description: "搜索引擎与联网",
          icon: IconSearch,
          path: "api/search",
          keywords: ["search", "联网", "搜索引擎", "Google", "Bing"],
        },
        {
          id: "api-mcp",
          label: "MCP",
          description: "模型上下文协议",
          icon: IconPlug,
          path: "api/mcp",
          keywords: ["MCP", "tool", "插件", "function calling"],
        },
      ],
    },
  ];

  /* ------------------------------------------------------------------ */
  /*  Search — PinyinFuseSearch                                          */
  /* ------------------------------------------------------------------ */

  /**
   * 将每个导航条目压平为可搜索的对象数组。
   * text 汇总了标签、描述、所属分组名与关键词，供拼音/模糊匹配使用；
   * id 用于把命中结果映射回原始条目。
   */
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
  });

  /** 防抖后的查询词，真正驱动过滤逻辑 */
  let debouncedQuery = $state("");

  /** 输入变化后延迟 200ms 更新 debouncedQuery，减少高频搜索计算 */
  const applyDebouncedQuery = debounce({ delay: 200 }, (q: string) => {
    debouncedQuery = q;
  });

  $effect(() => {
    // 依赖原始查询词，输入即触发（去抖内部处理节流）
    applyDebouncedQuery(settingsPanelStore.searchQuery);
    return () => applyDebouncedQuery.cancel();
  });

  /* ------------------------------------------------------------------ */
  /*  Derived — Route-based active state                                 */
  /* ------------------------------------------------------------------ */

  const currentLocation = $derived(router.location);

  /** Extract the sub-path after /settings/ */
  let activePath = $derived.by((): string => {
    const loc = currentLocation;
    if (loc.startsWith(SETTINGS_BASE + "/")) {
      return loc.slice(SETTINGS_BASE.length + 1);
    }
    // Fallback: if exactly /settings, default to first item
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

  /** 命中的条目 id 集合；无查询词时为 null 表示不过滤 */
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
                <!-- Collapsed item count badge — on the right -->
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
                  <span
                    class={[
                      "truncate text-sm transition-colors duration-200",
                      isActive ? "font-medium" : "font-normal",
                    ]}
                  >
                    {item.label}
                  </span>
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
