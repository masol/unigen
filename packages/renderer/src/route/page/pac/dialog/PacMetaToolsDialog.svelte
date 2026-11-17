<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { pacStore } from "$lib/store/ui/pac.svelte";
  import { safeApi } from "$lib/utils/api";
  import type { PacFrontMatter, PacToolConfig } from "@app/main/types";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconCheck,
    IconCircle,
    IconLoader2,
    IconSearch,
    IconX,
  } from "@tabler/icons-svelte";
  import { onMount } from "svelte";

  import {
    buildArrayPatch,
    buildStringArrayPatch,
    readStringArray,
    type PacMetaDialogCommonProps,
  } from "./pac-meta-dialog-utils";

  let { value, onClose, onCancel }: PacMetaDialogCommonProps = $props();

  // ── 常量 ──

  const PAGE_SIZE = 30;
  const SEARCH_DEBOUNCE_MS = 200;

  type TabId = "skills" | "tools" | "agents" | "knowledgeBases";

  type PickerItem = {
    id: string;
    name?: string;
    title?: string;
    label?: string;
    description?: string;
    desc?: string;
  };

  type PickerLoader = (
    query: string,
    offset: number,
  ) => Promise<{ items: PickerItem[]; hasMore: boolean }>;

  // ── 可复用检索状态源 ──

  class PickerSource {
    items = $state<PickerItem[]>([]);
    loading = $state(false);
    loadingMore = $state(false);
    error = $state<string | null>(null);
    hasMore = $state(false);
    query = $state("");
    loadedOnce = $state(false);

    #loader: PickerLoader;
    #seq = 0;
    #timer: ReturnType<typeof setTimeout> | undefined = undefined;

    constructor(loader: PickerLoader) {
      this.#loader = loader;
    }

    async reload(): Promise<void> {
      const seq = ++this.#seq;
      this.loading = true;
      this.error = null;
      try {
        const result = await this.#loader(this.query.trim(), 0);
        if (seq !== this.#seq) return;
        this.items = result.items.slice();
        this.hasMore = result.hasMore;
        this.loadedOnce = true;
      } catch (err) {
        if (seq !== this.#seq) return;
        this.error = err instanceof Error ? err.message : "加载失败";
      } finally {
        if (seq === this.#seq) this.loading = false;
      }
    }

    async loadMore(): Promise<void> {
      if (!this.hasMore || this.loading || this.loadingMore) return;
      const seq = this.#seq;
      this.loadingMore = true;
      try {
        const result = await this.#loader(this.query.trim(), this.items.length);
        if (seq !== this.#seq) return;
        this.items = [...this.items, ...result.items];
        this.hasMore = result.hasMore;
      } catch (err) {
        if (seq !== this.#seq) return;
        this.error = err instanceof Error ? err.message : "加载更多失败";
      } finally {
        this.loadingMore = false;
      }
    }

    setQuery(next: string): void {
      this.query = next;
      if (this.#timer) clearTimeout(this.#timer);
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        void this.reload();
      }, SEARCH_DEBOUNCE_MS);
    }

    dispose(): void {
      if (this.#timer) clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  // ── Mock：知识库 & Agent 文件（待接入真实 API） ──

  const MOCK_KNOWLEDGE_BASES: PickerItem[] = [
    {
      id: "kb-product-docs",
      name: "产品文档",
      description: "需求、功能说明与发布记录。",
    },
    {
      id: "kb-design-system",
      name: "设计系统",
      description: "组件规范、样式令牌与交互模式。",
    },
    {
      id: "kb-engineering-handbook",
      name: "工程手册",
      description: "代码规范、Git 流程与工程实践。",
    },
    {
      id: "kb-api-reference",
      name: "API 参考",
      description: "对外接口定义与调用示例。",
    },
    {
      id: "kb-customer-faq",
      name: "客户问答",
      description: "常见问题与客服话术。",
    },
    {
      id: "kb-security-policy",
      name: "安全策略",
      description: "数据分级、权限与合规要求。",
    },
  ];

  function relativePath(fromFile: string, targetFile: string): string {
    const from = fromFile.split("/").slice(0, -1);
    const to = targetFile.split("/");
    let i = 0;
    while (i < from.length && i < to.length && from[i] === to[i]) i += 1;
    const parts = [
      ...Array<string>(from.length - i).fill(".."),
      ...to.slice(i),
    ];
    const rel = parts.join("/");
    return rel.startsWith(".") ? rel : `./${rel}`;
  }

  function buildMockAgents(currentPath: string): PickerItem[] {
    const baseDir = currentPath.includes("/")
      ? currentPath.slice(0, currentPath.lastIndexOf("/"))
      : "";

    const files = [
      "researcher.md",
      "reviewer.md",
      "writer.md",
      "agents/planner.md",
      "agents/formatter.md",
      "agents/critic.md",
    ];

    return files.map((file) => {
      const fullPath = baseDir ? `${baseDir}/${file}` : file;
      return {
        id: fullPath,
        name: relativePath(currentPath, fullPath),
        description: "PAC Agent 定义文件。",
      };
    });
  }

  // ── 检索源 ──

  const skillsSource = new PickerSource(async (query, offset) => {
    const result = await safeApi().agent.searchSkills({
      query,
      limit: PAGE_SIZE,
      offset,
    });
    return {
      items: (result?.items ?? []) as PickerItem[],
      hasMore: result?.hasMore ?? false,
    };
  });

  const toolsSource = new PickerSource(async (query, offset) => {
    const result = await safeApi().agent.searchTools({
      query,
      limit: PAGE_SIZE,
      offset,
    });
    return {
      items: (result?.items ?? []) as PickerItem[],
      hasMore: result?.hasMore ?? false,
    };
  });

  const agentsSource = new PickerSource(async (query) => {
    // TODO: 接入真实的 PAC 文件树 API，返回当前项目下所有 .md 文件的绝对路径。
    // 期望语义：以当前文档路径为基准，允许展示相对路径（./x、../y/z）。
    const currentPath = pacStore.doc?.path ?? "";
    const all = buildMockAgents(currentPath);
    const term = query.trim().toLowerCase();
    const items = term
      ? all.filter(
          (it) =>
            (it.name ?? "").toLowerCase().includes(term) ||
            (it.description ?? "").toLowerCase().includes(term),
        )
      : all;
    return { items, hasMore: false };
  });

  const knowledgeBasesSource = new PickerSource(async (query) => {
    // 假数据：后续替换为真实知识库检索 API。
    const term = query.trim().toLowerCase();
    const items = term
      ? MOCK_KNOWLEDGE_BASES.filter(
          (it) =>
            (it.name ?? "").toLowerCase().includes(term) ||
            (it.description ?? "").toLowerCase().includes(term),
        )
      : MOCK_KNOWLEDGE_BASES;
    return { items, hasMore: false };
  });

  const sourceByTab: Record<TabId, PickerSource> = {
    skills: skillsSource,
    tools: toolsSource,
    agents: agentsSource,
    knowledgeBases: knowledgeBasesSource,
  };

  // ── 初始值 ──

  const initialTools: PacToolConfig[] = Array.isArray(value.tools)
    ? [...value.tools]
    : [];

  let selectedSkills = $state<string[]>(readStringArray(value, "skills"));
  let selectedKnowledgeBases = $state<string[]>(
    readStringArray(value, "knowledgeBases"),
  );
  let selectedBuiltinToolIds = $state<string[]>(
    initialTools
      .filter(
        (tool): tool is Extract<PacToolConfig, { type: "builtin" }> =>
          tool.type === "builtin",
      )
      .map((tool) => tool.id),
  );
  let selectedAgentPaths = $state<string[]>(
    initialTools
      .filter(
        (tool): tool is Extract<PacToolConfig, { type: "agent" }> =>
          tool.type === "agent",
      )
      .map((tool) => tool.path),
  );

  // ── Tab 状态与懒加载 ──

  let activeTab = $state<TabId>("skills");

  function ensureLoaded(tab: TabId): void {
    const source = sourceByTab[tab];
    if (source.loadedOnce || source.loading) return;
    void source.reload();
  }

  function handleTabChange(next: string): void {
    const tab = next as TabId;
    if (tab === activeTab) return;
    activeTab = tab;
    ensureLoaded(tab);
  }

  onMount(() => {
    ensureLoaded(activeTab);
    return () => {
      for (const source of Object.values(sourceByTab)) source.dispose();
    };
  });

  // ── 选择 / 名称解析 ──

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function toggleSkill(id: string): void {
    selectedSkills = toggle(selectedSkills, id);
  }

  function toggleBuiltinTool(id: string): void {
    selectedBuiltinToolIds = toggle(selectedBuiltinToolIds, id);
  }

  function toggleAgent(path: string): void {
    selectedAgentPaths = toggle(selectedAgentPaths, path);
  }

  function toggleKnowledgeBase(id: string): void {
    selectedKnowledgeBases = toggle(selectedKnowledgeBases, id);
  }

  function resolveName(source: PickerSource, id: string): string {
    const found = source.items.find((it) => it.id === id);
    return found?.name ?? found?.title ?? found?.label ?? id;
  }

  // ── 构建并保存 ──

  /**
   * 合并 tools：
   * - 保留原顺序中仍被选中的 builtin / agent；
   * - 其他类型（search / mcp_local）原样保留；
   * - 新选中的 builtin / agent 追加到末尾。
   */
  function buildTools(): PacToolConfig[] {
    const result: PacToolConfig[] = [];
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const usedBuiltin = new Set<string>();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const usedAgent = new Set<string>();

    for (const tool of initialTools) {
      if (tool.type === "builtin") {
        if (
          selectedBuiltinToolIds.includes(tool.id) &&
          !usedBuiltin.has(tool.id)
        ) {
          usedBuiltin.add(tool.id);
          result.push(tool);
        }
      } else if (tool.type === "agent") {
        if (
          selectedAgentPaths.includes(tool.path) &&
          !usedAgent.has(tool.path)
        ) {
          usedAgent.add(tool.path);
          result.push(tool);
        }
      } else {
        result.push(tool);
      }
    }

    for (const id of selectedBuiltinToolIds) {
      if (!usedBuiltin.has(id)) {
        usedBuiltin.add(id);
        result.push({ type: "builtin", id });
      }
    }

    for (const path of selectedAgentPaths) {
      if (!usedAgent.has(path)) {
        usedAgent.add(path);
        result.push({ type: "agent", path });
      }
    }

    return result;
  }

  function save(): void {
    const tools = buildTools();

    const patch: Partial<PacFrontMatter> = {
      skills: buildStringArrayPatch(value.skills, selectedSkills),
      knowledgeBases: buildStringArrayPatch(
        value.knowledgeBases,
        selectedKnowledgeBases,
      ),
      tools: buildArrayPatch(value.tools, tools) as PacToolConfig[] | undefined,
    };

    onClose?.(patch);
  }
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → PacMetaPickerPanel.svelte]→        │ -->
<!-- │ 职责：单个 Tab 内的"搜索框 + 已选 chips + 可滚动列表"│ -->
<!-- │ 通用面板，接收 PickerSource 与当前已选 id 列表。    │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
{#snippet pickerPanel(
  source: PickerSource,
  selectedIds: string[],
  toggleFn: (id: string) => void,
  placeholder: string,
  emptyLabel: string,
)}
  <div class="space-y-3">
    <div class="relative">
      <IconSearch
        size={14}
        stroke={1.5}
        class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="text"
        value={source.query}
        {placeholder}
        aria-label={placeholder}
        oninput={(e) => source.setQuery(e.currentTarget.value)}
        class="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      {#if source.query}
        <button
          type="button"
          onclick={() => source.setQuery("")}
          class="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="清除筛选"
          title="清除筛选"
        >
          <IconX size={12} stroke={2} />
        </button>
      {/if}
    </div>

    <div class="flex min-h-9 flex-wrap items-center gap-1.5" use:autoAnimate>
      {#if selectedIds.length === 0}
        <span class="text-xs text-muted-foreground">尚未选择任何项</span>
      {:else}
        {#each selectedIds as id (id)}
          <button
            type="button"
            onclick={() => toggleFn(id)}
            class="group flex items-center gap-1 rounded-lg border border-border/50 bg-muted/40 py-1 pl-2 pr-1 text-xs text-foreground transition-all duration-200 hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
          >
            <span class="max-w-[16rem] truncate">{resolveName(source, id)}</span
            >
            <IconX
              size={11}
              stroke={2}
              class="shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
            />
          </button>
        {/each}
      {/if}
    </div>

    <div
      class="relative h-72 overflow-hidden rounded-xl border border-border/50 bg-background"
    >
      {#if source.loading && source.items.length === 0}
        <div class="space-y-2 p-2">
          {#each [0, 1, 2, 3, 4] as key (key)}
            <Skeleton class="h-10 rounded-lg" />
          {/each}
        </div>
      {:else if source.error && source.items.length === 0}
        <div
          class="flex h-full flex-col items-center justify-center gap-2 px-4 text-center"
        >
          <p class="text-xs text-destructive">{source.error}</p>
          <Button
            variant="outline"
            size="sm"
            class="rounded-lg"
            onclick={() => void source.reload()}
          >
            重试
          </Button>
        </div>
      {:else if source.items.length === 0}
        <div class="flex h-full items-center justify-center px-4 text-center">
          <p class="text-xs text-muted-foreground">{emptyLabel}</p>
        </div>
      {:else}
        <div
          class="h-full overflow-y-auto overflow-x-hidden p-1.5"
          onscroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
              void source.loadMore();
            }
          }}
        >
          {#each source.items as item (item.id)}
            {@const selected = selectedIds.includes(item.id)}
            <button
              type="button"
              onclick={() => toggleFn(item.id)}
              aria-pressed={selected}
              title={item.description ?? item.desc ?? undefined}
              class="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
            >
              <span
                class="mt-0.5 flex size-4 shrink-0 items-center justify-center"
              >
                {#if selected}
                  <span
                    class="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <IconCheck size={10} stroke={2.5} />
                  </span>
                {:else}
                  <IconCircle
                    size={14}
                    stroke={1.5}
                    class="text-muted-foreground/50"
                  />
                {/if}
              </span>
              <span class="min-w-0 flex-1">
                <span class="line-clamp-1 text-sm font-medium text-foreground">
                  {item.name ?? item.title ?? item.label ?? item.id}
                </span>
                {#if item.description ?? item.desc}
                  <span class="line-clamp-1 text-xs text-muted-foreground">
                    {item.description ?? item.desc}
                  </span>
                {/if}
              </span>
            </button>
          {/each}
          {#if source.loadingMore}
            <div
              class="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground"
            >
              <IconLoader2 size={13} stroke={1.5} class="animate-spin" />
              加载更多…
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/snippet}
<!-- ╭─── / PacMetaPickerPanel ───╮ -->

<div class="space-y-5 p-6">
  <header class="space-y-1.5">
    <h2 class="text-lg font-medium">可用工具</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      勾选 Agent 可用的技能、工具、子 Agent 与知识库。其他类型的工具声明（如
      search / mcp_local）会保持原样保留。
    </p>
  </header>

  <div class="min-h-[420px]">
    <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
      <Tabs.List class="grid w-full grid-cols-4">
        <Tabs.Trigger value="skills">技能</Tabs.Trigger>
        <Tabs.Trigger value="tools">工具</Tabs.Trigger>
        <Tabs.Trigger value="agents">Agent</Tabs.Trigger>
        <Tabs.Trigger value="knowledgeBases">知识库</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="skills" class="mt-4 animate-fade-in">
        {@render pickerPanel(
          skillsSource,
          selectedSkills,
          toggleSkill,
          "筛选技能…",
          "没有匹配的技能，试试调整筛选词。",
        )}
      </Tabs.Content>

      <Tabs.Content value="tools" class="mt-4 animate-fade-in">
        {@render pickerPanel(
          toolsSource,
          selectedBuiltinToolIds,
          toggleBuiltinTool,
          "筛选工具…",
          "没有匹配的工具，试试调整筛选词。",
        )}
      </Tabs.Content>

      <Tabs.Content value="agents" class="mt-4 animate-fade-in">
        {@render pickerPanel(
          agentsSource,
          selectedAgentPaths,
          toggleAgent,
          "筛选 Agent…",
          "没有找到可用的 Agent 文件。",
        )}
      </Tabs.Content>

      <Tabs.Content value="knowledgeBases" class="mt-4 animate-fade-in">
        {@render pickerPanel(
          knowledgeBasesSource,
          selectedKnowledgeBases,
          toggleKnowledgeBase,
          "筛选知识库…",
          "没有匹配的知识库。",
        )}
      </Tabs.Content>
    </Tabs.Root>
  </div>

  <div class="flex justify-end gap-3 pt-1">
    <Button variant="outline" class="rounded-xl" onclick={() => onCancel?.()}>
      取消
    </Button>
    <Button class="rounded-xl" onclick={save}>保存</Button>
  </div>
</div>
