<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { safeApi } from "$lib/utils/api";
  import type { SkillSearchItem } from "@app/main/types";
  import {
    IconChevronDown,
    IconFolderOpen,
    IconLoader2,
    IconTrash,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";

  let {
    skill,
    removing = false,
    showRelevance = false,
    onRemove,
  }: {
    skill: SkillSearchItem;
    removing?: boolean;
    /** 仅在搜索态下展示相关性标签；浏览全部时无 query，标签无意义。 */
    showRelevance?: boolean;
    onRemove?: () => void;
  } = $props();

  const source = $derived.by(() => {
    const value = skill.metadata?.source;
    return typeof value === "string" && value.trim() ? value : null;
  });

  const description = $derived(skill.description?.trim() || "暂无描述");

  let expanded = $state(false);
  /** 描述在折叠态是否真的溢出（决定是否显示「展开全部」）。 */
  let overflowing = $state(false);

  /**
   * 相关性分档阈值。
   *
   * ⚠️ 以下阈值假定后端返回归一化的 0–1 相关度分数（如余弦相似度）。
   * - 若后端返回 RRF 融合分数（通常 < 0.05），必须先把阈值改成
   *   { strong: 0.03, related: 0.015 } 之类的量级，或让后端归一化。
   * - 阈值必须用真实查询与技能数据校准，不能直接套用经验值。
   */
  const RELEVANCE_THRESHOLDS = {
    strong: 0.75,
    related: 0.5,
  } as const;

  /**
   * 从搜索结果上读取相关度分数。
   *
   * 按优先级尝试多个常见字段名，兼容不同后端实现：
   * - rerankScore：启用 rerank 时的权威分数（与 toolsearch 一致）；
   * - score / similarity：hybrid 或向量检索的融合/相似度分数。
   *
   * 读取不到有限数值时返回 null → 不渲染标签（优雅降级）。
   * 注意：若后端在未启用 rerank 时把 rerankScore 写成 0 而不是省略，
   * 会被误判为「弱相关」，需后端确认该字段的缺省行为。
   */
  function readRelevanceScore(item: SkillSearchItem): number | null {
    const record = item as unknown as Record<string, unknown>;
    for (const key of ["rerankScore", "score", "similarity"] as const) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  type RelevanceBadge = {
    label: string;
    variant: "default" | "secondary" | "outline";
  };

  /**
   * 把原始分数映射为定性标签，绝不向用户展示数值。
   *
   * 原因：原始分数对用户零信息量，且不同检索模式（RRF / 余弦）量纲
   * 完全不同，展示数字只会造成误导。定性分档是 Appian / Langfuse
   * 等语义搜索产品的共同做法。
   */
  const relevance = $derived.by((): RelevanceBadge | null => {
    if (!showRelevance) return null;

    const score = readRelevanceScore(skill);
    if (score === null) return null;

    if (score >= RELEVANCE_THRESHOLDS.strong) {
      return { label: "强相关", variant: "default" };
    }
    if (score >= RELEVANCE_THRESHOLDS.related) {
      return { label: "相关", variant: "secondary" };
    }
    return { label: "弱相关", variant: "outline" };
  });

  /**
   * 通过 ResizeObserver 实测溢出，而不是按字符长度猜阈值：
   * 中英文混排、宽度变化（栅格响应式）下都准确。
   * 展开后直接跳过测量，保留 overflowing 原值以继续显示「收起」。
   */
  function watchOverflow(node: HTMLElement) {
    const measure = () => {
      if (expanded) return;
      overflowing = node.scrollHeight > node.clientHeight + 1;
    };

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();

    return () => observer.disconnect();
  }

  async function openFolder() {
    try {
      await safeApi().system.showItemInFolder({ path: skill.path });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "打开技能目录失败");
    }
  }
</script>

<article
  class="group flex h-full flex-col rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md has-focus-visible:-translate-y-0.5 has-focus-visible:shadow-md"
>
  <div class="min-w-0">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <h3 class="truncate text-lg font-medium" title={skill.name}>
        {skill.name}
      </h3>
      {#if relevance}
        <Badge
          variant={relevance.variant}
          class="rounded-lg text-xs"
          title="按与查询的语义相关度分档，非精确百分比"
        >
          {relevance.label}
        </Badge>
      {/if}
      {#if source}
        <Badge variant="secondary" class="rounded-lg text-xs">
          {source}
        </Badge>
      {/if}
    </div>

    <p
      {@attach watchOverflow}
      class={[
        "mt-2 wrap-break-word text-sm text-muted-foreground",
        expanded ? "" : "line-clamp-3",
      ]}
      title={skill.description?.trim() || undefined}
    >
      {description}
    </p>

    {#if overflowing || expanded}
      <button
        type="button"
        class="mt-1 inline-flex items-center gap-1 rounded-lg text-xs text-primary transition-all duration-200 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
      >
        {expanded ? "收起" : "展开"}
        <!-- Tabler 图标组件的 class 只接受 string，不能用 Svelte 5 的数组语法 -->
        <IconChevronDown
          size={12}
          stroke={1.5}
          class="transition-transform duration-200 {expanded
            ? 'rotate-180'
            : ''}"
        />
      </button>
    {/if}
  </div>

  <!--
    底部操作栏：两个 icon-only 按钮视觉权重对齐（左侧路径 / 右侧卸载）。
    卸载按钮默认中性灰，仅在 hover / focus 时暴露破坏性语义（红色），
    红色警示留给二次确认对话框中的确认按钮，列表入口不做视觉焦点。
  -->
  <div class="mt-auto flex items-center justify-between gap-3 pt-4">
    <div class="flex min-w-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        class="size-7 shrink-0 rounded-lg text-muted-foreground/60 transition-all duration-200 hover:text-foreground"
        aria-label="在文件夹中显示"
        title={skill.path}
        onclick={() => void openFolder()}
      >
        <IconFolderOpen size={14} stroke={1.5} />
      </Button>
      <span
        class="truncate font-mono text-xs text-muted-foreground/60"
        title={skill.id}
      >
        {skill.id}
      </span>
    </div>

    <Button
      variant="ghost"
      size="icon"
      class="size-7 shrink-0 rounded-lg text-muted-foreground/60 transition-all duration-200 hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive"
      disabled={removing}
      aria-busy={removing}
      aria-label={removing ? `正在卸载 ${skill.name}` : `卸载 ${skill.name}`}
      title="卸载技能"
      onclick={() => onRemove?.()}
    >
      {#if removing}
        <IconLoader2 size={14} stroke={1.5} class="animate-spin" />
      {:else}
        <IconTrash size={14} stroke={1.5} />
      {/if}
    </Button>
  </div>
</article>
