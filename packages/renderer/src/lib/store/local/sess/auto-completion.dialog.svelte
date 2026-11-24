<!-- packages/renderer/src/lib/store/local/sess/auto-completion.dialog.svelte -->
<!--
  自动续写配置。

  界面上的两种方式，与持久化字段名是反的，映射只写在 STRATEGY_OF / MECHANISM_OF：
    被动（stall）→ strategy "active"  + activePrompt
                   比较「思考」与「正文」是否完全一致，一致即视为停滞
    主动（probe）→ strategy "passive" + passiveProbePrompt / passiveCompletionMarker
                   / passiveAppendPrompt
                   先问模型「是否输出完毕」，再检测正文里的完成标记；
                   passiveAppendPrompt 追加到用户输入末尾，使首轮回复即带标记

  方式选择刻意使用原生 <select>：
  下拉菜单组件通常把内容 portal 到 body，与对话框处于同一 stacking context，
  在部分主题/尺寸下会被对话框内容盖住；原生 select 的弹出列表不参与页面层叠，
  且这里只有三个静态选项，不需要 portal、搜索或分组能力。

  布局约定（切换方式不得跳动、不得出现滚动条）：
  三种方式共用一个固定高度的内容区，且被动/主动的字段骨架完全对齐：
        块1（输入区） / 固定行 / 块2（输入区或只读说明） / 提示行 / 轮次行
  提示行与轮次行始终占据固定高度，因此外框尺寸在任意模式下完全一致。
-->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import {
    IconAlertTriangle,
    IconBolt,
    IconChevronDown,
    IconPower,
  } from "@tabler/icons-svelte";
  import {
    normalizeCompletionConfig,
    type AutoCompletionStrategy,
    type AutoTaskConfig,
  } from "./session.types";

  type Props = {
    initialConfig?: AutoTaskConfig;
  } & DialogComponentProps<AutoTaskConfig>;

  /** 续写机制：内部语义名，刻意与持久化字段名解耦。 */
  type Mechanism = "stall" | "probe";
  /** 界面三态：无 / 被动 / 主动。 */
  type Mode = "none" | Mechanism;

  const STRATEGY_OF: Record<Mechanism, AutoCompletionStrategy> = {
    stall: "active",
    probe: "passive",
  };
  const MECHANISM_OF: Record<AutoCompletionStrategy, Mechanism> = {
    active: "stall",
    passive: "probe",
  };

  const MODES: Array<{ value: Mode; label: string }> = [
    { value: "none", label: "无" },
    { value: "stall", label: "被动" },
    { value: "probe", label: "主动" },
  ];

  let { initialConfig = {}, onClose, onCancel }: Props = $props();

  // 打开对话框那一刻的快照，脏判断的唯一基准
  const initial = normalizeCompletionConfig(initialConfig.completion);

  let mode = $state<Mode>(
    initial.enabled ? (MECHANISM_OF[initial.strategy] ?? "probe") : "none",
  );

  let activePrompt = $state(initial.activePrompt);
  let probePrompt = $state(initial.passiveProbePrompt);
  let appendPrompt = $state(
    initial.passiveAppendPrompt ||
      (initial.passiveCompletionMarker
        ? `请在回复的最后单独输出一行,内容为：\n ${initial.passiveCompletionMarker}`
        : ""),
  );
  let marker = $state(initial.passiveCompletionMarker);
  let roundsText = $state(String(initial.maxRounds));

  const rounds = $derived.by((): number => {
    const text = roundsText.trim();
    if (text === "") return Number.NaN;
    const value = Number(text);
    return Number.isInteger(value) ? value : Number.NaN;
  });

  const roundsValid = $derived(
    Number.isInteger(rounds) && rounds >= 1 && rounds <= 100,
  );

  const draftActivePrompt = $derived(activePrompt.trim());
  const draftProbePrompt = $derived(probePrompt.trim());
  const draftAppendPrompt = $derived(appendPrompt.trim());
  const draftMarker = $derived(marker.trim());

  /**
   * 脏判断逐字段显式比较，不依赖序列化：
   * - 关闭状态下不改写 strategy，避免「切到被动再切回无」后仍被判为已改动；
   * - 轮次只在合法时才参与比较，非法值交给校验拦截，不会静默写入 NaN；
   * - 文本按 trim 后比较，与保存时写入的值保持一致。
   */
  const isDirty = $derived.by((): boolean => {
    const enabledNow = mode !== "none";
    if (enabledNow !== initial.enabled) return true;
    if (mode !== "none" && STRATEGY_OF[mode] !== initial.strategy) return true;
    if (roundsValid && rounds !== initial.maxRounds) return true;
    if (draftActivePrompt !== initial.activePrompt.trim()) return true;
    if (draftProbePrompt !== initial.passiveProbePrompt.trim()) return true;
    if (draftAppendPrompt !== initial.passiveAppendPrompt.trim()) return true;
    if (draftMarker !== initial.passiveCompletionMarker.trim()) return true;
    return false;
  });

  /** 只校验当前可见字段，避免「看不到的字段拦住保存」。 */
  const validationError = $derived.by((): string | null => {
    if (mode === "none") return null;
    if (!roundsValid) return "最多续写轮次须为 1-100 的整数";
    if (mode === "stall") {
      return draftActivePrompt ? null : "续写提示语不能为空";
    }
    if (!draftProbePrompt) return "续写提示语不能为空";
    if (!draftMarker) return "完成标记不能为空";
    // 追加提示词允许留空，仅在提示行说明额外的请求开销
    return null;
  });

  const canSave = $derived(isDirty && validationError === null);

  const appendPlaceholder = $derived(
    draftMarker
      ? `例如：请在回复的最后单独输出一行 ${draftMarker}`
      : "例如：请在回复的最后单独输出一行完成标记",
  );

  /**
   * 原生 select 写回的是 string，此处做字面量收窄，
   * 既保住 Mode 的联合类型，也防止意外的非法值污染配置来源。
   */
  function handleModeChange(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value;
    if (value === "none" || value === "stall" || value === "probe") {
      mode = value;
    }
  }

  function handleSave() {
    if (!canSave) return;

    onClose({
      ...initialConfig,
      completion: {
        enabled: mode !== "none",
        strategy: mode === "none" ? initial.strategy : STRATEGY_OF[mode],
        maxRounds: roundsValid ? rounds : initial.maxRounds,
        activePrompt: draftActivePrompt,
        passiveProbePrompt: draftProbePrompt,
        passiveAppendPrompt: draftAppendPrompt,
        passiveCompletionMarker: draftMarker,
      },
    });
  }
</script>

<div class="flex flex-col gap-4 p-6">
  <div class="flex items-start gap-3">
    <div
      class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
    >
      <IconBolt class="size-4" stroke={1.5} />
    </div>
    <div class="min-w-0 space-y-0.5">
      <h2 class="text-lg font-medium leading-tight">自动续写</h2>
      <p class="text-sm text-muted-foreground">
        模型输出被截断时自动发送续写请求
      </p>
    </div>
  </div>

  <!-- 方式选择：单选语义，原生下拉，固定三选项 -->
  <div class="flex items-center justify-between gap-3">
    <label for="completion-mode" class="text-sm font-medium">续写方式</label>
    <div class="relative w-52 shrink-0">
      <select
        id="completion-mode"
        value={mode}
        onchange={handleModeChange}
        class="h-9 w-full appearance-none rounded-xl border border-border/60 bg-background pl-3 pr-9 text-sm text-foreground outline-none transition-colors duration-150 hover:border-primary/40 focus:border-primary"
      >
        {#each MODES as item (item.value)}
          <option value={item.value} class="bg-background text-foreground">
            {item.label}
          </option>
        {/each}
      </select>
      <IconChevronDown
        class="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        stroke={1.5}
      />
    </div>
  </div>

  <!-- 固定高度内容区：三种方式骨架一致，切换时不改变外框尺寸 -->
  <div class="h-96 rounded-2xl border border-border/50 bg-card p-4">
    {#if mode === "none"}
      <div
        class="flex h-full flex-col items-center justify-center gap-3 text-center"
      >
        <div
          class="flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
        >
          <IconPower class="size-4" stroke={1.5} />
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">自动续写已关闭</p>

        </div>
      </div>
    {:else}
      <div class="flex h-full min-h-0 flex-col gap-2">
        <!-- 块1：主提示语 -->
        {#if mode === "stall"}
          <div class="flex min-h-0 flex-1 flex-col gap-2">
            <div class="flex shrink-0 items-baseline justify-between gap-3">
              <Label for="completion-primary-prompt" class="shrink-0">
                续写提示语
              </Label>
              <span class="truncate text-xs text-muted-foreground">
                思考与正文完全一致时发送
              </span>
            </div>
            <textarea
              id="completion-primary-prompt"
              bind:value={activePrompt}
              class="min-h-0 flex-1 resize-none rounded-xl border border-border/50 bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus:border-primary"
            ></textarea>
          </div>
        {:else}
          <div class="flex min-h-0 flex-1 flex-col gap-2">
            <div class="flex shrink-0 items-baseline justify-between gap-3">
              <Label for="completion-primary-prompt" class="shrink-0">
                续写提示语
              </Label>
              <span class="truncate text-xs text-muted-foreground">
                完整则输出标记，未完整则继续
              </span>
            </div>
            <textarea
              id="completion-primary-prompt"
              bind:value={probePrompt}
              class="min-h-0 flex-1 resize-none rounded-xl border border-border/50 bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus:border-primary"
            ></textarea>
          </div>
        {/if}

        <!-- 固定行：被动为静态说明，主动为完成标记输入，高度一致 -->
        {#if mode === "stall"}
          <div class="flex h-8 shrink-0 items-center justify-end">
            <span class="truncate text-xs text-muted-foreground">
              思考内容与正文内容完全一致时，视为模型输出停滞，发送续写提示语继续生成。
            </span>
          </div>
        {:else}
          <div class="flex h-8 shrink-0 items-center gap-2.5">
            <Label for="completion-marker" class="shrink-0">完成标记</Label>
            <Input
              id="completion-marker"
              bind:value={marker}
              class="h-8 w-40 rounded-lg font-mono"
            />
            <span class="min-w-0 truncate text-xs text-muted-foreground">
              正文出现即视为完整
            </span>
          </div>
        {/if}

        <!-- 块2：被动为触发规则说明，主动为自动追加提示词 -->
        {#if mode === "stall"}
          <!-- <div class="flex min-h-0 flex-1 flex-col gap-2">
            <Label class="shrink-0">触发条件</Label>
            <div
              class="min-h-0 flex-1 overflow-hidden rounded-xl bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
            >
              思考内容与正文内容完全一致时，视为模型输出停滞，发送续写提示语继续生成。
            </div>
          </div> -->
        {:else}
          <div class="flex min-h-0 flex-1 flex-col gap-2">
            <div class="flex shrink-0 items-baseline justify-between gap-3">
              <Label for="completion-append-prompt" class="shrink-0">
                自动追加提示词
              </Label>
              <span class="truncate text-xs text-muted-foreground">
                追加到用户输入末尾
              </span>
            </div>
            <textarea
              id="completion-append-prompt"
              bind:value={appendPrompt}
              placeholder={appendPlaceholder}
              class="min-h-0 flex-1 resize-none rounded-xl border border-border/50 bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            ></textarea>
          </div>
        {/if}

        <!-- 提示行：固定高度，留空时给出额外请求开销的警示 -->
        <div class="flex h-4.5 shrink-0 items-center gap-1.5 text-xs">
          {#if mode === "probe" && !draftAppendPrompt}
            <IconAlertTriangle
              class="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              stroke={1.5}
            />
            <span
              class="min-w-0 truncate text-amber-700 dark:text-amber-300"
              title="留空时每轮都会额外发送一次确认请求，即使内容已完整"
            >
              留空时每轮都会额外发送一次确认请求，即使内容已完整
            </span>
          {:else if mode === "probe"}
            <span class="min-w-0 truncate text-muted-foreground">
              模型首次回复即可携带完成标记，可省去一次探测请求
            </span>
          {/if}
        </div>

        <!-- 轮次行：只在被动/主动渲染；无模式下由占位块撑满同一高度 -->
        <div class="flex h-8 shrink-0 items-center gap-2.5">
          <Label for="completion-max-rounds" class="shrink-0">
            最多续写轮次
          </Label>
          <Input
            id="completion-max-rounds"
            type="text"
            inputmode="numeric"
            bind:value={roundsText}
            class="h-8 w-20 rounded-lg tabular-nums"
          />
          <span class="min-w-0 truncate text-xs text-muted-foreground">
            达到后停止，避免无限循环
          </span>
        </div>
      </div>
    {/if}
  </div>

  <div class="flex items-start justify-between gap-4">
    <p
      role="status"
      class="min-h-4 min-w-0 flex-1 text-xs leading-relaxed wrap-break-word text-destructive"
    >
      {validationError ?? ""}
    </p>
    <div class="flex shrink-0 items-center gap-2">
      <Button variant="outline" class="rounded-xl" onclick={() => onCancel()}>
        取消
      </Button>
      <Button
        class="rounded-xl"
        disabled={!canSave}
        title={validationError ?? (isDirty ? undefined : "未做改动")}
        onclick={handleSave}
      >
        确定
      </Button>
    </div>
  </div>
</div>
