<script lang="ts">
  import {
    IconAspectRatio,
    IconClock,
    IconGauge,
    IconLanguage,
    IconPalette,
    IconDimensions,
    IconMovie,
    IconUsersGroup,
  } from "@tabler/icons-svelte";
  import * as Select from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import { cn } from "$lib/utils";

  // ╭───────────────────────────────────────────────────────────────╮
  // │ Mock Data — 默认值与可选项
  // ╰───────────────────────────────────────────────────────────────╯
  const aspectRatios = [
    { value: "9:16", label: "手机竖屏 / 抖音 / 快手", hint: "9:16" },
    { value: "16:9", label: "电脑 / 电视 / 哔哩哔哩", hint: "16:9" },
    { value: "1:1", label: "小红书 / 微信头像", hint: "1:1" },
    { value: "4:3", label: "传统电视 / iPad 横屏", hint: "4:3" },
    { value: "3:4", label: "iPad 竖屏 / 书页", hint: "3:4" },
    { value: "21:9", label: "电影院宽银幕 / 超宽显示器", hint: "21:9" },
    { value: "4:5", label: "小红书竖版 / 杂志封面", hint: "4:5" },
    { value: "2:1", label: "微博 / 网页横幅", hint: "2:1" },
  ] as const;

  const resolutions = [
    { value: "360p", label: "360p", sub: "极速预览 / 低带宽", short: "SD" },
    { value: "480p", label: "480p", sub: "标清 / 草稿评审", short: "SD+" },
    { value: "720p", label: "720p", sub: "高清 / 通用首选", short: "HD" },
    { value: "1080p", label: "1080p", sub: "全高清 / 主流平台", short: "FHD" },
    { value: "2K", label: "2K (1440p)", sub: "QHD / 影视后期", short: "QHD" },
    { value: "4K", label: "4K (2160p)", sub: "UHD / 高端制作", short: "UHD" },
  ] as const;

  const frameRates = [
    { value: "24", label: "24 fps", sub: "电影 / 标准影视" },
    { value: "25", label: "25 fps", sub: "PAL 电视制式" },
    { value: "30", label: "30 fps", sub: "通用网络视频" },
    { value: "50", label: "50 fps", sub: "PAL 高帧率" },
    { value: "60", label: "60 fps", sub: "流畅 / 游戏 / 体育" },
    { value: "120", label: "120 fps", sub: "慢动作 / 高速摄影" },
  ] as const;

  const durations = [
    { value: "unlimited", label: "不分集", sub: "由剧情自动切分" },
    { value: "30s", label: "30 秒", sub: "快速短片" },
    { value: "60s", label: "60 秒", sub: "标准短视频" },
    { value: "3min", label: "3 分钟", sub: "中等篇幅" },
    { value: "5min", label: "5 分钟", sub: "完整短剧" },
    { value: "10min", label: "10 分钟", sub: "迷你剧" },
    { value: "20min", label: "20 分钟", sub: "网络短剧" },
    { value: "40min", label: "40 分钟", sub: "标准电视剧单集" },
    { value: "60min", label: "60 分钟", sub: "长篇剧集" },
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

  // 语言:用 ISO 代码徽章替代 emoji 国旗(跨平台字体安全)
  const languages = [
    {
      value: "zh",
      label: "中文",
      code: "ZH",
      sub: "普通话 / 简体",
      tone: "from-rose-500 to-amber-500",
    },
    {
      value: "en",
      label: "English",
      code: "EN",
      sub: "美式英语",
      tone: "from-sky-500 to-indigo-500",
    },
    {
      value: "ja",
      label: "日本語",
      code: "JA",
      sub: "标准日语",
      tone: "from-pink-500 to-fuchsia-500",
    },
    {
      value: "ko",
      label: "한국어",
      code: "KO",
      sub: "标准韩语",
      tone: "from-emerald-500 to-teal-500",
    },
    {
      value: "es",
      label: "Español",
      code: "ES",
      sub: "西班牙语",
      tone: "from-orange-500 to-red-500",
    },
    {
      value: "fr",
      label: "Français",
      code: "FR",
      sub: "法语",
      tone: "from-blue-500 to-cyan-500",
    },
  ] as const;

  const audienceRatings = [
    {
      value: "g",
      label: "全年龄",
      code: "G",
      sub: "普世价值 / 适合所有人",
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
      code: "PG-13",
      sub: "13 岁以上",
      tone: "from-amber-400 to-orange-500",
    },
    {
      value: "r",
      label: "限制级",
      code: "R",
      sub: "17 岁以下需家长陪同",
      tone: "from-orange-500 to-red-600",
    },
    {
      value: "nc17",
      label: "成人级",
      code: "NC-17",
      sub: "仅限成人观看",
      tone: "from-red-500 to-rose-700",
    },
  ] as const;

  const styles = [
    {
      value: "cinematic",
      label: "电影",
      sub: "电影感色调 / 浅景深 / 宽银幕构图",
      swatch: "from-amber-700/30 via-stone-900/20 to-neutral-900/40",
    },
    {
      value: "anime",
      label: "动漫",
      sub: "赛璐璐 / 高饱和 / 强描边",
      swatch: "from-pink-400/40 via-fuchsia-500/30 to-indigo-500/40",
    },
    {
      value: "cg",
      label: "CG / 3D",
      sub: "PBR 渲染 / 全局光照 / 物理材质",
      swatch: "from-cyan-400/30 via-blue-600/30 to-slate-900/40",
    },
    {
      value: "live",
      label: "真人写实",
      sub: "电影级实拍 / 自然光 / 真实纹理",
      swatch: "from-emerald-400/20 via-teal-500/20 to-slate-800/40",
    },
    {
      value: "watercolor",
      label: "水墨 / 国风",
      sub: "水墨晕染 / 留白构图 / 东方意境",
      swatch: "from-stone-300/40 via-zinc-400/20 to-stone-700/40",
    },
    {
      value: "comic",
      label: "美式漫画",
      sub: "硬朗线条 / 网点 / 高对比",
      swatch: "from-yellow-400/40 via-orange-500/30 to-red-600/40",
    },
    {
      value: "pixel",
      label: "像素 / 复古游戏",
      sub: "8-bit / 16-bit 像素艺术",
      swatch: "from-lime-400/40 via-green-500/30 to-emerald-700/40",
    },
    {
      value: "noir",
      label: "黑色电影",
      sub: "高反差 / 单色光影 / 悬疑氛围",
      swatch: "from-zinc-300/30 via-zinc-700/40 to-black/60",
    },
  ] as const;

  // ╭───────────────────────────────────────────────────────────────╮
  // │ Reactive State
  // ╰───────────────────────────────────────────────────────────────╯
  let aspectRatio = $state<string>("9:16");
  let resolution = $state<string>("480p");
  let frameRate = $state<string>("24");
  let duration = $state<string>("3min");
  let pace = $state<string>("normal");
  let language = $state<string>("zh");
  let audience = $state<string>("pg");
  let style = $state<string>("cinematic");

  // 派生的展示用快照
  let aspectRatioMeta = $derived(
    aspectRatios.find((r) => r.value === aspectRatio) ?? aspectRatios[0],
  );
  let resolutionMeta = $derived(
    resolutions.find((r) => r.value === resolution) ?? resolutions[0],
  );
  let frameRateMeta = $derived(
    frameRates.find((f) => f.value === frameRate) ?? frameRates[0],
  );
  let durationMeta = $derived(
    durations.find((d) => d.value === duration) ?? durations[0],
  );
  let languageMeta = $derived(
    languages.find((l) => l.value === language) ?? languages[0],
  );
  let audienceMeta = $derived(
    audienceRatings.find((a) => a.value === audience) ?? audienceRatings[0],
  );
  let styleMeta = $derived(styles.find((s) => s.value === style) ?? styles[0]);
</script>

<!-- ╭───────────────────────────────────────────────────────────────╮ -->
<!-- │ SettingsPanel.svelte — 剧本转视频左侧设置面板              │ -->
<!-- │ 职责：收集目标视频的画幅 / 分辨率 / 帧率 / 时长 /         │ -->
<!-- │       节奏 / 语言 / 受众分级 / 画面风格 八类核心参数      │ -->
<!-- ╰───────────────────────────────────────────────────────────────╯ -->
<aside
  class="w-full h-full bg-card border border-border/50 rounded-3xl shadow-sm flex flex-col animate-fade-in"
>
  <!-- ╭─ 滚动容器:固定外高,内部独立滚动 ──────────────────────────╮ -->
  <div class="flex-1 min-h-0 overflow-y-auto p-8 space-y-8">
    <!-- ╭─ Header ───────────────────────────────────────────────────╮ -->
    <header class="space-y-2">
      <div class="flex items-center gap-2">
        <div class="size-8 rounded-lg bg-primary/10 grid place-items-center">
          <IconMovie size={18} stroke={1.5} class="text-primary" />
        </div>
        <h2 class="text-lg font-medium text-foreground">视频参数</h2>
      </div>
      <p class="text-xs text-muted-foreground leading-relaxed">
        配置目标视频的基础规格,影响后续分镜生成与渲染输出
      </p>
    </header>
    <!-- ╰─── / Header ───╯ -->

    <!-- ╭─────────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → AspectRatioSelect.svelte]                   │ -->
    <!-- │ 职责：横纵比下拉选择,Trigger 含比例徽章 + 平台说明          │ -->
    <!-- ╰─────────────────────────────────────────────────────────────╯ -->
    <section class="space-y-3">
      <div class="flex items-center gap-2">
        <IconAspectRatio size={16} stroke={1.5} class="text-muted-foreground" />
        <Label
          class="text-xs font-medium text-muted-foreground tracking-wide uppercase"
        >
          目标视频横纵比
        </Label>
      </div>

      <Select.Root type="single" bind:value={aspectRatio}>
        <Select.Trigger class="w-full h-auto min-h-12 rounded-xl py-3">
          <span class="flex items-center gap-3 min-w-0">
            <span
              class="shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium bg-primary/10 text-primary"
            >
              {aspectRatioMeta.hint}
            </span>
            <span class="text-sm font-medium text-foreground truncate">
              {aspectRatioMeta.label}
            </span>
          </span>
        </Select.Trigger>
        <Select.Content class="rounded-xl max-h-80">
          {#each aspectRatios as ratio (ratio.value)}
            <Select.Item
              value={ratio.value}
              label={ratio.label}
              class="rounded-lg"
            >
              <div class="flex items-center gap-3 w-full">
                <span
                  class="shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium bg-muted text-muted-foreground"
                >
                  {ratio.hint}
                </span>
                <span class="text-sm text-foreground">{ratio.label}</span>
              </div>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </section>
    <!-- ╰─── / AspectRatioSelect ───╯ -->

    <!-- ╭─────────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → ResolutionSelect.svelte]                    │ -->
    <!-- │ 职责：分辨率下拉,带画质等级徽章与适用场景                  │ -->
    <!-- ╰─────────────────────────────────────────────────────────────╯ -->
    <section class="space-y-3">
      <div class="flex items-center gap-2">
        <IconDimensions size={16} stroke={1.5} class="text-muted-foreground" />
        <Label
          class="text-xs font-medium text-muted-foreground tracking-wide uppercase"
        >
          分辨率
        </Label>
      </div>

      <Select.Root type="single" bind:value={resolution}>
        <Select.Trigger class="w-full h-auto min-h-12 rounded-xl py-3">
          <span class="flex items-center gap-3 min-w-0">
            <span
              class="shrink-0 inline-flex items-center justify-center min-w-9 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-foreground/10 text-foreground"
            >
              {resolutionMeta.short}
            </span>
            <span class="flex items-baseline gap-2 min-w-0">
              <span class="text-sm font-semibold text-foreground">
                {resolutionMeta.label}
              </span>
              <span class="text-xs text-muted-foreground truncate">
                {resolutionMeta.sub}
              </span>
            </span>
          </span>
        </Select.Trigger>
        <Select.Content class="rounded-xl max-h-80">
          {#each resolutions as r (r.value)}
            <Select.Item value={r.value} label={r.label} class="rounded-lg">
              <div class="flex items-center gap-3 w-full">
                <span
                  class="shrink-0 inline-flex items-center justify-center min-w-9 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-muted text-muted-foreground"
                >
                  {r.short}
                </span>
                <div class="flex items-baseline gap-2 min-w-0">
                  <span class="text-sm font-medium text-foreground"
                    >{r.label}</span
                  >
                  <span class="text-xs text-muted-foreground truncate"
                    >{r.sub}</span
                  >
                </div>
              </div>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </section>
    <!-- ╰─── / ResolutionSelect ───╯ -->

    <!-- ╭─────────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → FrameRateSelect.svelte]                     │ -->
    <!-- │ 职责：帧率下拉,带场景适配说明                                │ -->
    <!-- ╰─────────────────────────────────────────────────────────────╯ -->
    <section class="space-y-3">
      <div class="flex items-center gap-2">
        <IconGauge size={16} stroke={1.5} class="text-muted-foreground" />
        <Label
          class="text-xs font-medium text-muted-foreground tracking-wide uppercase"
        >
          帧率
        </Label>
      </div>

      <Select.Root type="single" bind:value={frameRate}>
        <Select.Trigger class="w-full h-auto min-h-12 rounded-xl py-3">
          <span class="flex items-center gap-3 min-w-0">
            <span
              class="shrink-0 inline-flex items-center justify-center min-w-9 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-foreground/10 text-foreground"
            >
              FPS
            </span>
            <span class="flex items-baseline gap-2 min-w-0">
              <span class="text-sm font-semibold text-foreground">
                {frameRateMeta.label}
              </span>
              <span class="text-xs text-muted-foreground truncate">
                {frameRateMeta.sub}
              </span>
            </span>
          </span>
        </Select.Trigger>
        <Select.Content class="rounded-xl max-h-80">
          {#each frameRates as f (f.value)}
            <Select.Item value={f.value} label={f.label} class="rounded-lg">
              <div class="flex items-center gap-3 w-full">
                <span
                  class="shrink-0 inline-flex items-center justify-center min-w-9 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-muted text-muted-foreground"
                >
                  FPS
                </span>
                <div class="flex items-baseline gap-2 min-w-0">
                  <span class="text-sm font-medium text-foreground"
                    >{f.label}</span
                  >
                  <span class="text-xs text-muted-foreground truncate"
                    >{f.sub}</span
                  >
                </div>
              </div>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </section>
    <!-- ╰─── / FrameRateSelect ───╯ -->

    <!-- ╭─────────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → DurationSelect.svelte]                      │ -->
    <!-- │ 职责：单集长度下拉,覆盖短视频 → 长篇剧集                   │ -->
    <!-- ╰─────────────────────────────────────────────────────────────╯ -->
    <section class="space-y-3">
      <div class="flex items-center gap-2">
        <IconClock size={16} stroke={1.5} class="text-muted-foreground" />
        <Label
          class="text-xs font-medium text-muted-foreground tracking-wide uppercase"
        >
          单集长度
        </Label>
      </div>

      <Select.Root type="single" bind:value={duration}>
        <Select.Trigger class="w-full h-auto min-h-12 rounded-xl py-3">
          <span class="flex items-center gap-3 min-w-0">
            <span
              class="shrink-0 inline-flex items-center justify-center min-w-9 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-foreground/10 text-foreground"
            >
              DUR
            </span>
            <span class="flex items-baseline gap-2 min-w-0">
              <span class="text-sm font-semibold text-foreground">
                {durationMeta.label}
              </span>
              <span class="text-xs text-muted-foreground truncate">
                {durationMeta.sub}
              </span>
            </span>
          </span>
        </Select.Trigger>
        <Select.Content class="rounded-xl max-h-80">
          {#each durations as d (d.value)}
            <Select.Item value={d.value} label={d.label} class="rounded-lg">
              <div class="flex items-center gap-3 w-full">
                <span
                  class="shrink-0 inline-flex items-center justify-center min-w-9 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-muted text-muted-foreground"
                >
                  DUR
                </span>
                <div class="flex items-baseline gap-2 min-w-0">
                  <span class="text-sm font-medium text-foreground"
                    >{d.label}</span
                  >
                  <span class="text-xs text-muted-foreground truncate"
                    >{d.sub}</span
                  >
                </div>
              </div>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </section>
    <!-- ╰─── / DurationSelect ───╯ -->

    <!-- ╭─────────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → PaceSelector.svelte]                        │ -->
    <!-- │ 职责：叙事节奏三选一,带状态色点的紧凑按钮组                │ -->
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
            onclick={() => (pace = p.value)}
            class={cn(
              "relative flex flex-col items-center gap-2 p-4 rounded-2xl text-center",
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

    <!-- ╭─────────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → LanguageSelect.svelte]                      │ -->
    <!-- │ 职责：语言下拉,渐变 ISO 代码徽章 + 本地化文案              │ -->
    <!-- ╰─────────────────────────────────────────────────────────────╯ -->
    <section class="space-y-3">
      <div class="flex items-center gap-2">
        <IconLanguage size={16} stroke={1.5} class="text-muted-foreground" />
        <Label
          class="text-xs font-medium text-muted-foreground tracking-wide uppercase"
        >
          语言
        </Label>
      </div>

      <Select.Root type="single" bind:value={language}>
        <Select.Trigger class="w-full h-auto min-h-12 rounded-xl py-3">
          <span class="flex items-center gap-3 min-w-0">
            <span
              class={cn(
                "shrink-0 inline-flex items-center justify-center size-7 rounded-lg text-[10px] font-mono font-bold text-white bg-gradient-to-br shadow-sm",
                languageMeta.tone,
              )}
            >
              {languageMeta.code}
            </span>
            <span class="flex items-baseline gap-2 min-w-0">
              <span class="text-sm font-semibold text-foreground">
                {languageMeta.label}
              </span>
              <span class="text-xs text-muted-foreground truncate">
                {languageMeta.sub}
              </span>
            </span>
          </span>
        </Select.Trigger>
        <Select.Content class="rounded-xl max-h-80">
          {#each languages as lang (lang.value)}
            <Select.Item
              value={lang.value}
              label={lang.label}
              class="rounded-lg"
            >
              <div class="flex items-center gap-3 w-full">
                <span
                  class={cn(
                    "shrink-0 inline-flex items-center justify-center size-7 rounded-lg text-[10px] font-mono font-bold text-white bg-gradient-to-br shadow-sm",
                    lang.tone,
                  )}
                >
                  {lang.code}
                </span>
                <div class="flex items-baseline gap-2 min-w-0">
                  <span class="text-sm font-medium text-foreground"
                    >{lang.label}</span
                  >
                  <span class="text-xs text-muted-foreground truncate"
                    >{lang.sub}</span
                  >
                </div>
              </div>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </section>
    <!-- ╰─── / LanguageSelect ───╯ -->

    <!-- ╭─────────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → AudienceSelect.svelte]                      │ -->
    <!-- │ 职责：受众分级下拉,色阶编码 G → NC-17                       │ -->
    <!-- ╰─────────────────────────────────────────────────────────────╯ -->
    <section class="space-y-3">
      <div class="flex items-center gap-2">
        <IconUsersGroup size={16} stroke={1.5} class="text-muted-foreground" />
        <Label
          class="text-xs font-medium text-muted-foreground tracking-wide uppercase"
        >
          受众分级
        </Label>
      </div>

      <Select.Root type="single" bind:value={audience}>
        <Select.Trigger class="w-full h-auto min-h-12 rounded-xl py-3">
          <span class="flex items-center gap-3 min-w-0">
            <span
              class={cn(
                "shrink-0 inline-flex items-center justify-center size-7 rounded-lg text-[10px] font-mono font-bold text-white bg-gradient-to-br shadow-sm",
                audienceMeta.tone,
              )}
            >
              {audienceMeta.code}
            </span>
            <span class="flex items-baseline gap-2 min-w-0">
              <span class="text-sm font-semibold text-foreground">
                {audienceMeta.label}
              </span>
              <span class="text-xs text-muted-foreground truncate">
                {audienceMeta.sub}
              </span>
            </span>
          </span>
        </Select.Trigger>
        <Select.Content class="rounded-xl max-h-80">
          {#each audienceRatings as a (a.value)}
            <Select.Item value={a.value} label={a.label} class="rounded-lg">
              <div class="flex items-center gap-3 w-full">
                <span
                  class={cn(
                    "shrink-0 inline-flex items-center justify-center size-7 rounded-lg text-[10px] font-mono font-bold text-white bg-gradient-to-br shadow-sm",
                    a.tone,
                  )}
                >
                  {a.code}
                </span>
                <div class="flex items-baseline gap-2 min-w-0">
                  <span class="text-sm font-medium text-foreground"
                    >{a.label}</span
                  >
                  <span class="text-xs text-muted-foreground truncate"
                    >{a.sub}</span
                  >
                </div>
              </div>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </section>
    <!-- ╰─── / AudienceSelect ───╯ -->

    <!-- ╭─────────────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → StyleSelect.svelte]                         │ -->
    <!-- │ 职责：画面风格下拉,Trigger 与 Item 均含渐变色卡预览        │ -->
    <!-- ╰─────────────────────────────────────────────────────────────╯ -->
    <section class="space-y-3 pb-2">
      <div class="flex items-center gap-2">
        <IconPalette size={16} stroke={1.5} class="text-muted-foreground" />
        <Label
          class="text-xs font-medium text-muted-foreground tracking-wide uppercase"
        >
          画面风格
        </Label>
      </div>

      <Select.Root type="single" bind:value={style}>
        <Select.Trigger class="w-full h-auto min-h-12 rounded-xl py-3">
          <span class="flex items-center gap-3 min-w-0">
            <span
              class={cn(
                "shrink-0 size-7 rounded-lg border border-border/50 bg-gradient-to-br",
                styleMeta.swatch,
              )}
            ></span>
            <span class="flex items-baseline gap-2 min-w-0">
              <span class="text-sm font-semibold text-foreground">
                {styleMeta.label}
              </span>
              <span class="text-xs text-muted-foreground truncate">
                {styleMeta.sub}
              </span>
            </span>
          </span>
        </Select.Trigger>
        <Select.Content class="rounded-xl max-h-80">
          {#each styles as s (s.value)}
            <Select.Item value={s.value} label={s.label} class="rounded-lg">
              <div class="flex items-center gap-3 w-full">
                <span
                  class={cn(
                    "shrink-0 size-7 rounded-lg border border-border/50 bg-gradient-to-br",
                    s.swatch,
                  )}
                ></span>
                <div class="flex items-baseline gap-2 min-w-0">
                  <span class="text-sm font-medium text-foreground"
                    >{s.label}</span
                  >
                  <span class="text-xs text-muted-foreground truncate"
                    >{s.sub}</span
                  >
                </div>
              </div>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </section>
    <!-- ╰─── / StyleSelect ───╯ -->
  </div>
  <!-- ╰─── / 滚动容器 ───╯ -->
</aside>
