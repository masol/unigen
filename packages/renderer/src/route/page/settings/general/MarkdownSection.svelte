<!-- packages/renderer/src/route/page/settings/general/MarkdownSection.svelte -->
<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  import { Separator } from "$lib/components/ui/separator";
  import { configStore } from "$lib/store/config.svelte";
  import type { MarkdownFontFamily } from "@app/main/types";
  import {
    IconBaselineDensityMedium,
    IconCode,
    IconColumnInsertRight,
    IconFoldDown,
    IconLetterCase,
    IconTypography,
  } from "@tabler/icons-svelte";

  // ── 候选值（离散预设，避免滑杆拖动时的抖动与误触） ─────
  const FONT_SIZES = [13, 14, 15, 16, 18, 20] as const;
  const CODE_FONT_SIZES = [12, 13, 14, 15, 16] as const;

  const LINE_HEIGHTS: { value: number; label: string }[] = [
    { value: 1.5, label: "紧凑 (1.5)" },
    { value: 1.7, label: "舒适 (1.7)" },
    { value: 2.0, label: "宽松 (2.0)" },
    { value: 2.3, label: "极宽 (2.3)" },
  ];

  const FONT_FAMILIES: { value: MarkdownFontFamily; label: string }[] = [
    { value: "system", label: "系统默认" },
    { value: "sans", label: "无衬线" },
    { value: "serif", label: "衬线" },
  ];

  const MAX_WIDTHS: { value: number; label: string }[] = [
    { value: 0, label: "全宽（跟随容器）" },
    { value: 1200, label: "宽 (1200px)" },
    { value: 860, label: "中 (860px)" },
    { value: 720, label: "窄 (720px)" },
  ];

  const AUTO_COLLAPSE: { value: number; label: string }[] = [
    { value: 0, label: "关闭（保持展开）" },
    { value: 15, label: "超过 15 行" },
    { value: 30, label: "超过 30 行" },
    { value: 50, label: "超过 50 行" },
  ];

  // ── 写入辅助（失败时 configStore 统一 toast） ───────────
  function setNumeric(
    key:
      | "markdownFontSize"
      | "markdownCodeFontSize"
      | "markdownMaxWidth"
      | "markdownAutoCollapseCode",
    raw: string,
  ) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    void configStore.setConfig(key, n);
  }

  function setLineHeight(raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    void configStore.setConfig("markdownLineHeight", n);
  }

  function setFontFamily(family: string) {
    void configStore.setConfig(
      "markdownFontFamily",
      family as MarkdownFontFamily,
    );
  }
</script>

<section class="space-y-4">
  <h2 class="text-lg font-medium text-foreground px-1">Markdown 阅读</h2>
  <div
    class="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-border"
  >
    <!-- ── Row: 正文字号 ── -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconTypography
            size={20}
            stroke={1.5}
            class="text-muted-foreground"
          />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">正文字号</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            控制 Markdown 正文显示大小(px)
          </p>
        </div>
      </div>
      <Select.Root
        type="single"
        value={String(configStore.markdownFontSize)}
        onValueChange={(v) => setNumeric("markdownFontSize", v)}
      >
        <Select.Trigger class="w-full sm:w-40 rounded-xl">
          <span class="truncate">{configStore.markdownFontSize} px</span>
        </Select.Trigger>
        <Select.Content class="rounded-xl">
          {#each FONT_SIZES as size (size)}
            <Select.Item value={String(size)} class="rounded-lg">
              {size} px
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <Separator class="bg-border/30" />

    <!-- ── Row: 行高 ── -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconBaselineDensityMedium
            size={20}
            stroke={1.5}
            class="text-muted-foreground"
          />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">行高</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            行间距倍数，越大越松弛
          </p>
        </div>
      </div>
      <Select.Root
        type="single"
        value={String(configStore.markdownLineHeight)}
        onValueChange={(v) => setLineHeight(v)}
      >
        <Select.Trigger class="w-full sm:w-40 rounded-xl">
          <span class="truncate">
            {configStore.markdownLineHeight.toFixed(1)} ×
          </span>
        </Select.Trigger>
        <Select.Content class="rounded-xl">
          {#each LINE_HEIGHTS as opt (opt.value)}
            <Select.Item value={String(opt.value)} class="rounded-lg">
              {opt.label}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <Separator class="bg-border/30" />

    <!-- ── Row: 字体族 ── -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconLetterCase
            size={20}
            stroke={1.5}
            class="text-muted-foreground"
          />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">字体风格</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            选择正文读起来更舒服的字体族
          </p>
        </div>
      </div>
      <Select.Root
        type="single"
        value={configStore.markdownFontFamily}
        onValueChange={(v) => setFontFamily(v)}
      >
        <Select.Trigger class="w-full sm:w-52 rounded-xl">
          <span class="truncate">
            {FONT_FAMILIES.find(
              (f) => f.value === configStore.markdownFontFamily,
            )?.label ?? "系统默认"}
          </span>
        </Select.Trigger>
        <Select.Content class="rounded-xl">
          {#each FONT_FAMILIES as opt (opt.value)}
            <Select.Item value={opt.value} class="rounded-lg">
              {opt.label}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <Separator class="bg-border/30" />

    <!-- ── Row: 代码字号 ── -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconCode size={20} stroke={1.5} class="text-muted-foreground" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">代码字号</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            代码块的字体大小(px)
          </p>
        </div>
      </div>
      <Select.Root
        type="single"
        value={String(configStore.markdownCodeFontSize)}
        onValueChange={(v) => setNumeric("markdownCodeFontSize", v)}
      >
        <Select.Trigger class="w-full sm:w-40 rounded-xl">
          <span class="truncate">{configStore.markdownCodeFontSize} px</span>
        </Select.Trigger>
        <Select.Content class="rounded-xl">
          {#each CODE_FONT_SIZES as size (size)}
            <Select.Item value={String(size)} class="rounded-lg">
              {size} px
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <Separator class="bg-border/30" />

    <!-- ── Row: 阅读宽度 ── -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconColumnInsertRight
            size={20}
            stroke={1.5}
            class="text-muted-foreground"
          />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">阅读宽度</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            限制单条消息的最大宽度，改善长文阅读节奏
          </p>
        </div>
      </div>
      <Select.Root
        type="single"
        value={String(configStore.markdownMaxWidth)}
        onValueChange={(v) => setNumeric("markdownMaxWidth", v)}
      >
        <Select.Trigger class="w-full sm:w-52 rounded-xl">
          <span class="truncate">
            {MAX_WIDTHS.find((w) => w.value === configStore.markdownMaxWidth)
              ?.label ?? `${configStore.markdownMaxWidth} px`}
          </span>
        </Select.Trigger>
        <Select.Content class="rounded-xl">
          {#each MAX_WIDTHS as opt (opt.value)}
            <Select.Item value={String(opt.value)} class="rounded-lg">
              {opt.label}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <Separator class="bg-border/30" />

    <!-- ── Row: 长代码自动折叠 ── -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconFoldDown size={20} stroke={1.5} class="text-muted-foreground" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">长代码自动折叠</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            超过阈值的代码块默认收起，可手动展开
          </p>
        </div>
      </div>
      <Select.Root
        type="single"
        value={String(configStore.markdownAutoCollapseCode)}
        onValueChange={(v) => setNumeric("markdownAutoCollapseCode", v)}
      >
        <Select.Trigger class="w-full sm:w-52 rounded-xl">
          <span class="truncate">
            {AUTO_COLLAPSE.find(
              (o) => o.value === configStore.markdownAutoCollapseCode,
            )?.label ?? `${configStore.markdownAutoCollapseCode} 行`}
          </span>
        </Select.Trigger>
        <Select.Content class="rounded-xl">
          {#each AUTO_COLLAPSE as opt (opt.value)}
            <Select.Item value={String(opt.value)} class="rounded-lg">
              {opt.label}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  </div>
</section>
