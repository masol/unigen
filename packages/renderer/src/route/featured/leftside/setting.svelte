<!-- $lib/components/panels/SettingsPanel.svelte -->
<script lang="ts">
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconPalette,
    IconCode,
    IconKeyboard,
    IconLanguage,
    IconBrain,
    IconDatabase,
    IconPhoto,
    IconMicrophone,
    IconRobot,
    IconTool,
    IconWorld,
    IconShield,
    IconBell,
    IconChevronRight,
    IconSettingsOff,
    IconInfoCircle,
    IconServer,
    IconHistory,
    IconDownload,
  } from "@tabler/icons-svelte";
  import { settingsPanelStore } from "./settings.svelte";

  /* ------------------------------------------------------------------ */
  /*  Types                                                              */
  /* ------------------------------------------------------------------ */

  type SettingsNavItem = {
    id: string;
    label: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any;
    path: string;
    keywords?: string[];
  };

  type SettingsGroup = {
    id: string;
    label: string;
    items: SettingsNavItem[];
  };

  /* ------------------------------------------------------------------ */
  /*  Built-in Groups                                                    */
  /* ------------------------------------------------------------------ */

  const builtinGroups: SettingsGroup[] = [
    {
      id: "general",
      label: "通用",
      items: [
        {
          id: "appearance",
          label: "外观",
          icon: IconPalette,
          path: "appearance",
          keywords: ["theme", "主题", "暗色", "亮色", "颜色", "字号"],
        },
        {
          id: "editor",
          label: "编辑器",
          icon: IconCode,
          path: "editor",
          keywords: ["font", "字体", "缩进", "行号", "自动保存"],
        },
        {
          id: "keybindings",
          label: "快捷键",
          icon: IconKeyboard,
          path: "keybindings",
          keywords: ["shortcut", "热键", "绑定", "快捷方式"],
        },
        {
          id: "language",
          label: "语言与区域",
          icon: IconLanguage,
          path: "language",
          keywords: ["locale", "中文", "english", "时区", "日期格式"],
        },
        {
          id: "notifications",
          label: "通知",
          icon: IconBell,
          path: "notifications",
          keywords: ["alert", "提醒", "消息", "推送", "声音"],
        },
        {
          id: "privacy",
          label: "隐私与安全",
          icon: IconShield,
          path: "privacy",
          keywords: ["security", "权限", "数据", "遥测", "日志"],
        },
        {
          id: "data",
          label: "数据管理",
          icon: IconDownload,
          path: "data",
          keywords: ["导入", "导出", "备份", "恢复", "清除"],
        },
        {
          id: "about",
          label: "关于",
          icon: IconInfoCircle,
          path: "about",
          keywords: ["版本", "version", "更新", "许可证", "license"],
        },
      ],
    },
    {
      id: "models",
      label: "模型管理",
      items: [
        {
          id: "models-providers",
          label: "模型供应商",
          icon: IconServer,
          path: "models/providers",
          keywords: [
            "OpenAI",
            "Anthropic",
            "provider",
            "API Key",
            "端点",
            "endpoint",
          ],
        },
        {
          id: "models-llm",
          label: "大语言模型",
          icon: IconBrain,
          path: "models/llm",
          keywords: [
            "LLM",
            "GPT",
            "Claude",
            "chat",
            "对话",
            "文本生成",
            "推理",
          ],
        },
        {
          id: "models-embedding",
          label: "嵌入模型",
          icon: IconDatabase,
          path: "models/embedding",
          keywords: ["vector", "向量", "RAG", "检索", "知识库"],
        },
        {
          id: "models-image",
          label: "图像模型",
          icon: IconPhoto,
          path: "models/image",
          keywords: [
            "DALL-E",
            "Stable Diffusion",
            "图片",
            "绘图",
            "生图",
            "vision",
          ],
        },
        {
          id: "models-speech",
          label: "语音模型",
          icon: IconMicrophone,
          path: "models/speech",
          keywords: ["TTS", "STT", "语音合成", "语音识别", "Whisper", "朗读"],
        },
      ],
    },
    {
      id: "agents",
      label: "智能体",
      items: [
        {
          id: "agents-default",
          label: "默认配置",
          icon: IconRobot,
          path: "agents/default",
          keywords: [
            "agent",
            "系统提示词",
            "system prompt",
            "温度",
            "temperature",
            "预设",
          ],
        },
        {
          id: "agents-tools",
          label: "工具管理",
          icon: IconTool,
          path: "agents/tools",
          keywords: [
            "function calling",
            "函数调用",
            "tool",
            "MCP",
            "插件",
            "能力",
          ],
        },
        {
          id: "agents-network",
          label: "网络访问",
          icon: IconWorld,
          path: "agents/network",
          keywords: ["proxy", "代理", "API", "网关", "联网", "搜索", "CORS"],
        },
        {
          id: "agents-history",
          label: "对话历史",
          icon: IconHistory,
          path: "agents/history",
          keywords: ["记录", "上下文", "context", "记忆", "memory", "保留"],
        },
      ],
    },
  ];

  /* ------------------------------------------------------------------ */
  /*  Filtered by search query                                           */
  /* ------------------------------------------------------------------ */

  let filteredGroups = $derived.by((): SettingsGroup[] => {
    const q = settingsPanelStore.searchQuery.trim().toLowerCase();
    if (!q) return builtinGroups;

    return builtinGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.id.toLowerCase().includes(q) ||
            group.label.toLowerCase().includes(q) ||
            (item.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
        ),
      }))
      .filter((group) => group.items.length > 0);
  });
</script>

<div class="flex h-full flex-col">
  <div class="flex-1 overflow-y-auto" use:autoAnimate>
    {#each filteredGroups as group, gi (group.id)}
      <div>
        <!-- Group header -->
        <div class={["px-3 pb-1", gi === 0 ? "pt-0.5" : "pt-4"]}>
          <span
            class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {group.label}
          </span>
        </div>

        <!-- Group items -->
        <div class="space-y-0.5" use:autoAnimate>
          {#each group.items as item (item.id)}
            {@const isActive = false}
            {@const Icon = item.icon}
            <button
              class={[
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition-all duration-200",
                isActive
                  ? "bg-primary/10 font-medium text-foreground"
                  : "text-foreground/80 hover:bg-accent/60",
              ]}
              aria-current={isActive ? "page" : undefined}
              onclick={() => void item.path}
            >
              <Icon
                class={[
                  "size-4 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground",
                ]}
              />
              <span class="min-w-0 flex-1 truncate text-xs">
                {item.label}
              </span>
              {#if isActive}
                <IconChevronRight class="size-3 shrink-0 text-primary/60" />
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/each}

    <!-- Empty search state -->
    {#if filteredGroups.length === 0}
      <div class="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <div
          class="flex size-10 items-center justify-center rounded-2xl bg-muted"
        >
          <IconSettingsOff class="size-5 text-muted-foreground" />
        </div>
        <div class="space-y-1">
          <p class="text-xs font-medium text-foreground">未找到匹配的设置项</p>
          <p class="text-xs text-muted-foreground">尝试使用其他关键词搜索</p>
        </div>
      </div>
    {/if}
  </div>
</div>
