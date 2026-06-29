<!-- $lib/components/script-to-video/SettingsPanel.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    IconAspectRatio,
    IconClock,
    IconGauge,
    IconLanguage,
    IconPalette,
    IconDeviceTv,
    IconUsersGroup,
  } from "@tabler/icons-svelte";
  import SettingSelect from "./SettingSelect.svelte";
  import { Label } from "$lib/components/ui/label";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { cn } from "$lib/utils";
  import {
    episodeDurations,
    specStore,
    videoLanguages,
    videoStyles,
  } from "./spec.svelte";

  // ╭───────────────────────────────────────────────────────────────╮
  // │ Mock Data — 默认值与可选项
  // ╰───────────────────────────────────────────────────────────────╯
  const aspectRatios = [
    {
      value: "9:16",
      label: "手机竖屏 / 抖音 / 快手",
      sub: "9:16",
      hint: "9:16",
    },
    {
      value: "16:9",
      label: "电脑 / 电视 / 哔哩哔哩",
      sub: "16:9",
      hint: "16:9",
    },
    { value: "1:1", label: "小红书 / 微信头像", sub: "1:1", hint: "1:1" },
    { value: "4:3", label: "传统电视 / iPad 横屏", sub: "4:3", hint: "4:3" },
    { value: "3:4", label: "iPad 竖屏 / 书页", sub: "3:4", hint: "3:4" },
    {
      value: "21:9",
      label: "电影院宽银幕 / 超宽屏",
      sub: "21:9",
      hint: "21:9",
    },
    { value: "4:5", label: "小红书竖版 / 杂志封面", sub: "4:5", hint: "4:5" },
    { value: "2:1", label: "微博 / 网页横幅", sub: "2:1", hint: "2:1" },
  ] as const;

  const resolutions = [
    // { value: "360p", label: "360p", sub: "极速预览 / 低带宽", short: "SD" },
    { value: "480p", label: "480p", sub: "标清 / 草稿评审", short: "SD+" },
    { value: "720p", label: "720p", sub: "高清 / 通用首选", short: "HD" },
    { value: "1080p", label: "1080p", sub: "全高清 / 主流平台", short: "FHD" },
    // { value: "2K", label: "2K (1440p)", sub: "QHD / 影视后期", short: "QHD" },
    { value: "4K", label: "4K (2160p)", sub: "UHD / 高端制作", short: "UHD" },
  ] as const;

  const frameRates = [
    { value: "24", label: "24 fps", sub: "电影 / 标准影视", short: "FPS" },
    { value: "25", label: "25 fps", sub: "PAL 电视制式", short: "FPS" },
    { value: "30", label: "30 fps", sub: "通用网络视频", short: "FPS" },
    { value: "50", label: "50 fps", sub: "PAL 高帧率", short: "FPS" },
    { value: "60", label: "60 fps", sub: "流畅 / 游戏 / 体育", short: "FPS" },
    { value: "120", label: "120 fps", sub: "慢动作 / 高速摄影", short: "FPS" },
  ] as const;

  const paces = [
    {
      value: "slow",
      label: "慢节奏",
      sub: "强调氛围与留白",
      dot: "bg-blue-500",
    },
    {
      value: "normal",
      label: "正常",
      sub: "标准叙事节奏",
      dot: "bg-emerald-500",
    },
    {
      value: "fast",
      label: "快节奏",
      sub: "高密度情节推进",
      dot: "bg-amber-500",
    },
  ] as const;

  const audienceRatings = [
    {
      value: "g",
      label: "全年龄",
      code: "G",
      sub: "适合所有人",
      tone: "from-emerald-400 to-emerald-600",
    },
    {
      value: "pg",
      label: "辅导级",
      code: "PG",
      sub: "建议家长陪同",
      tone: "from-lime-400 to-green-600",
    },
    {
      value: "pg13",
      label: "13+",
      code: "PG13",
      sub: "13 岁以上",
      tone: "from-amber-400 to-orange-500",
    },
    {
      value: "r",
      label: "限制级",
      code: "R",
      sub: "17 岁以下需陪同",
      tone: "from-orange-500 to-red-600",
    },
    {
      value: "nc17",
      label: "成人级",
      code: "NC17",
      sub: "仅限成人观看",
      tone: "from-red-500 to-rose-700",
    },
  ] as const;

  // ╭───────────────────────────────────────────────────────────────╮
  // │ 生命周期：初始化数据
  // ╰───────────────────────────────────────────────────────────────╯
  onMount(() => {
    specStore.init();
  });

  // ╭───────────────────────────────────────────────────────────────╮
  // │ 响应式派生：从 store 读取当前值
  // ╰───────────────────────────────────────────────────────────────╯
  let aspectRatio = $derived(specStore.aspectRatio);
  let resolution = $derived(specStore.resolution);
  let frameRate = $derived(specStore.frameRate);
  let duration = $derived(specStore.duration);
  let pace = $derived(specStore.pace);
  let language = $derived(specStore.language);
  let audience = $derived(specStore.audience);
  let style = $derived(specStore.style);
  let loading = $derived(specStore.isLoading);
</script>

<!-- 透明内容容器:不带卡片 chrome、不自带滚动,由父级 ScrollArea 接管滚动 -->
<div class="min-h-full space-y-6 p-2">
  {#if loading}
    <!-- ╭─────────────────────────────────────────────────────────────╮ -->
    <!-- │ 加载态：等尺寸、等布局的骨架屏占位                          │ -->
    <!-- ╰─────────────────────────────────────────────────────────────╯ -->
    <div class="space-y-6 animate-pulse">
      {#each Array(8) as __, i (i)}
        <div class="space-y-3">
          <!-- 标题区骨架 -->
          <div class="flex items-center gap-2">
            <Skeleton class="size-4 rounded" />
            <Skeleton class="h-3 w-24 rounded" />
          </div>
          <!-- 下拉框骨架 -->
          <Skeleton class="h-12 w-full rounded-xl" />
        </div>
      {/each}
    </div>
  {:else}
    <!-- ╭─────────────────────────────────────────────────────────────╮ -->
    <!-- │ 内容态：已加载完成，显示所有设置项                          │ -->
    <!-- ╰─────────────────────────────────────────────────────────────╯ -->
    <div class="space-y-6 animate-fade-in">
      <!-- 横纵比 -->
      <SettingSelect
        label="目标视频横纵比"
        icon={IconAspectRatio}
        options={aspectRatios}
        value={aspectRatio}
        onchange={specStore.setAspectRatio.bind(specStore)}
      >
        {#snippet badge(o)}
          <span
            class="shrink-0 inline-flex items-center justify-center min-w-12 px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-primary/10 text-primary"
          >
            {o.hint}
          </span>
        {/snippet}
      </SettingSelect>

      <!-- 分辨率 -->
      <SettingSelect
        label="分辨率"
        icon={IconDeviceTv}
        options={resolutions}
        value={resolution}
        onchange={specStore.setResolution.bind(specStore)}
      >
        {#snippet badge(o)}
          <span
            class="shrink-0 inline-flex items-center justify-center min-w-10 px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-foreground/10 text-foreground"
          >
            {o.short}
          </span>
        {/snippet}
      </SettingSelect>

      <!-- 帧率 -->
      <SettingSelect
        label="帧率"
        icon={IconGauge}
        options={frameRates}
        value={frameRate}
        onchange={specStore.setFrameRate.bind(specStore)}
      >
        {#snippet badge(o)}
          <span
            class="shrink-0 inline-flex items-center justify-center min-w-10 px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-foreground/10 text-foreground"
          >
            {o.short}
          </span>
        {/snippet}
      </SettingSelect>

      <!-- 单集长度 -->
      <SettingSelect
        label="单集长度"
        icon={IconClock}
        options={episodeDurations}
        value={duration}
        onchange={specStore.setDuration.bind(specStore)}
      >
        {#snippet badge(o)}
          <span
            class="shrink-0 inline-flex items-center justify-center min-w-10 px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-foreground/10 text-foreground"
          >
            {o.short}
          </span>
        {/snippet}
      </SettingSelect>

      <!-- ╭─────────────────────────────────────────────────────────────╮ -->
      <!-- │ [可抽取子组件 → PaceSelector.svelte]                        │ -->
      <!-- │ 职责：叙事节奏三选一,带状态色点的紧凑按钮组(非下拉)      │ -->
      <!-- ╰─────────────────────────────────────────────────────────────╯ -->
      <section class="space-y-3">
        <div class="flex items-center gap-2">
          <IconGauge size={16} stroke={1.5} class="text-muted-foreground" />
          <Label
            class="text-xs font-medium text-muted-foreground tracking-wide uppercase"
          >
            叙事节奏
          </Label>
        </div>

        <div class="grid grid-cols-3 gap-3">
          {#each paces as p (p.value)}
            {@const selected = pace === p.value}
            <button
              type="button"
              onclick={() => specStore.setPace(p.value)}
              class={cn(
                "relative flex flex-col items-center gap-2 p-3 rounded-2xl text-center",
                "border transition-all duration-200",
                "hover:-translate-y-0.5 hover:shadow-xl",
                selected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/50 bg-background hover:border-border",
              )}
            >
              <span class={cn("size-2 rounded-full", p.dot)}></span>
              <span class="text-sm font-medium text-foreground">{p.label}</span>
              <span class="text-[10px] text-muted-foreground leading-tight">
                {p.sub}
              </span>
            </button>
          {/each}
        </div>
      </section>
      <!-- ╰─── / PaceSelector ───╯ -->

      <!-- 语言 -->
      <SettingSelect
        label="语言"
        icon={IconLanguage}
        options={videoLanguages}
        value={language}
        onchange={specStore.setLanguage.bind(specStore)}
      >
        {#snippet badge(o)}
          <span
            class={cn(
              "shrink-0 inline-flex items-center justify-center size-7 rounded-lg text-[10px] font-mono font-bold text-white bg-linear-to-br shadow-sm",
              o.tone,
            )}
          >
            {o.code}
          </span>
        {/snippet}
      </SettingSelect>

      <!-- 受众分级 -->
      <SettingSelect
        label="受众分级"
        icon={IconUsersGroup}
        options={audienceRatings}
        value={audience}
        onchange={specStore.setAudience.bind(specStore)}
      >
        {#snippet badge(o)}
          <span
            class={cn(
              "shrink-0 inline-flex items-center justify-center min-w-9 px-1.5 h-7 rounded-lg text-[10px] font-mono font-bold text-white bg-linear-to-br shadow-sm",
              o.tone,
            )}
          >
            {o.code}
          </span>
        {/snippet}
      </SettingSelect>

      <!-- 画面风格 -->
      <SettingSelect
        label="画面风格"
        icon={IconPalette}
        options={videoStyles}
        value={style}
        onchange={specStore.setStyle.bind(specStore)}
      >
        {#snippet badge(o)}
          <span
            class={cn(
              "shrink-0 size-7 rounded-lg border border-border/50 bg-linear-to-br",
              o.swatch,
            )}
          ></span>
        {/snippet}
      </SettingSelect>
    </div>
  {/if}
</div>

<!--
╭───────────────────────────────────────────────────────────────╮
│ 需要的组件                                                     │
╰───────────────────────────────────────────────────────────────╯
• Label
• Skeleton

╭───────────────────────────────────────────────────────────────╮
│ 建议抽取的子组件                                               │
╰───────────────────────────────────────────────────────────────╯
→ PaceSelector.svelte — 叙事节奏三选一,带状态色点的紧凑按钮组
→ SettingSection.svelte — 通用设置区块包裹器(图标+标题+内容插槽)
→ SettingSkeleton.svelte — 单个设置项的加载骨架占位
-->
