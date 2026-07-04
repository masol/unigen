<script lang="ts">
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import {
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Separator } from "$lib/components/ui/separator";
  import {
    DefInputToken,
    DefOutputToken,
    DefScore,
  } from "$lib/store/config.svelte";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import { parseModel } from "$lib/utils/model/feature";
  import {
    CAPABILITY_TAGS,
    formatTokens,
    FUNCTION_TAGS,
    tagIcons,
    tagLabels,
    VERSION_TAGS,
    type Model,
    type ModelAbility,
    type ModelOption,
  } from "$lib/utils/model/types";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconAlertCircle,
    IconAlertTriangle,
    IconChevronDown,
    IconFilter,
    IconLoader2,
    IconSparkles,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";
  import ModelSelectCombobox from "./ModelSelectCombobox.svelte";
  import { fetchAvailableModels } from "./fetchModels";

  /* ─── Props ─── */
  type Props = {
    model?: Partial<Model>;
    /** 拉取可用模型列表的上下文（透传给 fetchAvailableModels） */
    fetchCtx?: { baseUrl?: string; apiKey?: string };
    onSave?: (model: Model) => Promise<void>;
  } & DialogComponentProps<Model>;

  let { model, fetchCtx, onSave, onClose, onCancel }: Props = $props();

  const isEditMode = !!model?.id;

  /* ─── 标签分组集合 ───
     · 功能（互斥，至少一个）：文本 / 图像 / 音频 … 一次仅一个，不可为空。
       其中 text 是启用「能力」的前提。
     · 版本（互斥，可为空）：一次仅一个，可不选。
     · 能力（多选）：仅当功能为 text 时可用，否则强制清空。 */
  const functionValues = Object.values(FUNCTION_TAGS) as ModelAbility[];
  const versionValues = Object.values(VERSION_TAGS) as ModelAbility[];
  const capabilityValues = Object.values(CAPABILITY_TAGS) as ModelAbility[];

  const functionSet = new Set(functionValues);
  const versionSet = new Set(versionValues);
  const capabilitySet = new Set(capabilityValues);

  const functionItems = functionValues.map((v) => ({
    value: v,
    label: tagLabels[v],
    icon: tagIcons[v],
  }));
  const versionItems = versionValues.map((v) => ({
    value: v,
    label: tagLabels[v],
    icon: tagIcons[v],
  }));
  const capabilityItems = capabilityValues.map((v) => ({
    value: v,
    label: tagLabels[v],
    icon: tagIcons[v],
  }));

  /* ─── 表单状态 ─── */
  let id = $state(model?.id ?? "");
  let abilities = $state<ModelAbility[]>(
    model?.abilities ?? [
      FUNCTION_TAGS.text,
      CAPABILITY_TAGS.tool,
      CAPABILITY_TAGS.reasoning,
    ],
  );
  let inctx = $state<number | undefined>(model?.inctx);
  let outctx = $state<number | undefined>(model?.outctx);
  let score = $state<number | undefined>(model?.score);

  let selectedModelId = $state(model?.id ?? "");

  /* ─── 派生 ─── */
  const currentFunction = $derived(abilities.find((a) => functionSet.has(a)));
  const currentVersion = $derived(abilities.find((a) => versionSet.has(a)));
  const capabilitySelected = $derived(
    new Set(abilities.filter((a) => capabilitySet.has(a))),
  );
  const capabilityEnabled = $derived(currentFunction === FUNCTION_TAGS.text);

  /* ─── 加载 / UI 状态 ─── */
  let options = $state<ModelOption[]>([]);
  let isLoadingModels = $state(true);
  let loadFailed = $state(false);

  let isSubmitting = $state(false);
  let errorMessage = $state("");

  // 筛选面板收起状态（默认展开）
  let filterOpen = $state(true);
  // 自动识别加载态
  let isDetecting = $state(false);

  /* ─── 进入时拉取可用模型 ─── */
  $effect(() => {
    void loadModels();
  });

  async function loadModels() {
    isLoadingModels = true;
    loadFailed = false;
    try {
      options = await fetchAvailableModels(fetchCtx ?? {});
    } catch {
      loadFailed = true;
      options = [];
    } finally {
      isLoadingModels = false;
    }
  }

  /* ─── 能力规范化（单遍 O(n)，Set 去重） ─── */
  function normalize(list: ModelAbility[]): ModelAbility[] {
    let activeFunc: ModelAbility | undefined;
    let activeVersion: ModelAbility | undefined;
    const caps: ModelAbility[] = [];
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const seenCap = new Set<ModelAbility>();

    for (const a of list) {
      if (functionSet.has(a)) activeFunc = a;
      else if (versionSet.has(a)) activeVersion = a;
      else if (capabilitySet.has(a) && !seenCap.has(a)) {
        seenCap.add(a);
        caps.push(a);
      }
    }

    const result: ModelAbility[] = [];
    if (activeFunc) result.push(activeFunc);
    if (activeVersion) result.push(activeVersion);
    if (activeFunc === FUNCTION_TAGS.text) result.push(...caps);
    return result;
  }

  /* ─── 将 preset 应用到筛选内容（复用于下拉选择 & 自动识别） ─── */
  type Preset = NonNullable<ModelOption["preset"]>;
  function applyPreset(p: Preset | undefined) {
    if (!p) return;
    if (p.abilities) abilities = normalize([...p.abilities]);
    if (p.inctx != null) inctx = p.inctx;
    if (p.outctx != null) outctx = p.outctx;
    if (p.score != null) score = p.score;
    // 应用后自动展开面板，便于查看识别结果
    filterOpen = true;
  }

  /* ─── 选中模型 → 自动填充 ─── */
  async function handleModelSelect(option: ModelOption) {
    selectedModelId = option.id;
    id = option.id;

    let preset: Preset | undefined = option.preset;
    if (!preset) {
      preset = autoDetectPreset(id.trim());
    }

    applyPreset(preset);
  }

  /* ─── 自动识别：异步函数（留空，由你实现） ───
     期望：根据当前 id / fetchCtx 推断出一个 preset 并返回。 */
  function autoDetectPreset(modelId: string): Preset | undefined {
    const modeInfo = parseModel(modelId);
    if (modeInfo) {
      const ret: Preset = {
        abilities: modeInfo.abilities,
        score: modeInfo.score || 50,
      };
      if (modeInfo.inctx) {
        ret.inctx = modeInfo.inctx;
      }
      if (modeInfo.outctx) {
        ret.outctx = modeInfo.outctx;
      }
      return ret;
    }
  }

  function handleAutoDetect() {
    if (isDetecting) return;
    isDetecting = true;
    let detectError = "";
    try {
      const preset = autoDetectPreset(id.trim());
      if (preset) {
        applyPreset(preset);
      } else {
        detectError = `未能识别出模型"${id.trim()}"的推荐配置`;
      }
    } catch (e) {
      detectError = e instanceof Error ? e.message : "识别失败，请重试";
    } finally {
      isDetecting = false;
    }
    if (detectError) {
      toast.error(detectError);
    }
  }

  /* ─── 功能组：互斥单选（至少一个 → 点自身无效，不可取消） ─── */
  function selectFunction(v: ModelAbility) {
    if (currentFunction === v) return;
    const rest = abilities.filter((a) => !functionSet.has(a));
    abilities = normalize([...rest, v]);
  }

  /* ─── 版本组：互斥单选（可为空 → 点自身取消） ─── */
  function selectVersion(v: ModelAbility) {
    const rest = abilities.filter((a) => !versionSet.has(a));
    abilities = normalize(currentVersion === v ? rest : [...rest, v]);
  }

  /* ─── 能力组：多选（仅文本可用） ─── */
  function toggleCapability(v: ModelAbility) {
    if (!capabilityEnabled) return;
    const next = capabilitySelected.has(v)
      ? abilities.filter((x) => x !== v)
      : [...abilities, v];
    abilities = normalize(next);
  }

  /* ─── 数字输入辅助 ─── */
  function numHandler(setter: (v: number | undefined) => void) {
    return (e: Event) => {
      const raw = (e.currentTarget as HTMLInputElement).value;
      const num = raw === "" ? undefined : Number(raw);
      setter(num != null && !Number.isNaN(num) ? num : undefined);
    };
  }

  /* ─── 校验：功能至少一个 + ID 非空 ─── */
  const isValid = $derived(id.trim().length > 0 && !!currentFunction);

  /* ─── 提交 ─── */
  async function handleSubmit() {
    if (!isValid || isSubmitting) return;
    isSubmitting = true;
    errorMessage = "";

    const result: Model = {
      id: id.trim(),
      abilities: normalize(abilities),
      inctx: inctx ?? DefInputToken,
      outctx: outctx ?? DefOutputToken,
      score: score ?? DefScore,
    };

    try {
      if (onSave) await onSave(result);
      onClose(result);
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "保存失败，请重试";
    } finally {
      isSubmitting = false;
    }
  }
</script>

<DialogHeader>
  <DialogTitle>{isEditMode ? "编辑模型" : "新建模型"}</DialogTitle>
  <DialogDescription>
    {isEditMode ? "修改模型标识及其筛选条件" : "选择或手动配置一个模型"}
  </DialogDescription>
</DialogHeader>

<div class="space-y-6 py-4" use:autoAnimate>
  <!-- 顶部警告：自动获取失败 -->
  {#if loadFailed}
    <Alert.Root class="rounded-xl border-amber-500/40 bg-amber-500/5">
      <IconAlertTriangle class="size-4 text-amber-500" stroke={1.5} />
      <Alert.Title>无法自动获取模型列表</Alert.Title>
      <Alert.Description>
        可能是 API Key 或接口地址有误。你仍可在下方手动填写模型标识并保存。
      </Alert.Description>
    </Alert.Root>
  {/if}

  <!-- ── 区块一 · 模型标识 ── -->
  <div class="space-y-4">
    {#if !loadFailed}
      <div class="space-y-2">
        <Label>选择模型</Label>
        <ModelSelectCombobox
          {options}
          selectedId={selectedModelId}
          loading={isLoadingModels}
          failed={loadFailed}
          onSelect={handleModelSelect}
        />
      </div>
    {/if}

    <div class="space-y-2">
      <Label for="dlg-model-id">模型标识 (ID)</Label>
      <Input
        id="dlg-model-id"
        bind:value={id}
        placeholder="例如: gpt-4o, deepseek-reasoner"
        class="rounded-xl font-mono"
      />
    </div>
  </div>

  <!-- ── 区块二 · 筛选条件（可整体收起） ── -->
  <Collapsible.Root
    bind:open={filterOpen}
    class="rounded-2xl border border-border/50 bg-muted/20"
  >
    <!-- 面板头部：标题 + 自动识别 + 收起触发器 -->
    <div class="flex items-center gap-2 p-4">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <IconFilter
          class="size-4 shrink-0 text-muted-foreground"
          stroke={1.5}
        />
        <div class="min-w-0">
          <h3 class="text-sm font-medium leading-tight">筛选条件</h3>
          <p class="truncate text-xs text-muted-foreground">
            运行期依据以下维度匹配合适的模型
          </p>
        </div>
      </div>

      <!-- 自动识别按钮（异步 · 独立加载态） -->
      <Button
        variant="outline"
        size="sm"
        class="h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs"
        onclick={handleAutoDetect}
        disabled={isDetecting || id.trim().length === 0}
      >
        {#if isDetecting}
          <IconLoader2 class="size-3.5 animate-spin" stroke={1.5} />
          识别中
        {:else}
          <IconSparkles class="size-3.5" stroke={1.5} />
          自动识别
        {/if}
      </Button>

      <!-- 收起触发器 -->
      <Collapsible.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            aria-label={filterOpen ? "收起筛选条件" : "展开筛选条件"}
            class="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground"
          >
            <IconChevronDown
              class={`size-4 transition-transform duration-200 ${filterOpen ? "rotate-180" : ""}`}
              stroke={1.5}
            />
          </button>
        {/snippet}
      </Collapsible.Trigger>
    </div>

    <Collapsible.Content>
      <div class="space-y-5 px-4 pb-4">
        <Separator class="bg-border/50" />

        <!-- 识别失败提示 -->
        <!-- {#if detectError}
          <Alert.Root class="rounded-xl border-amber-500/40 bg-amber-500/5">
            <IconAlertTriangle class="size-4 text-amber-500" stroke={1.5} />
            <Alert.Description>{detectError}</Alert.Description>
          </Alert.Root>
        {/if} -->

        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → AbilitySelector.svelte]              │ -->
        <!-- │ 职责：功能(互斥必选)/版本(互斥可空)/能力(依赖文本)   │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <div class="space-y-4">
          <!-- 维度一 · 功能（互斥单选 · 至少一个） -->
          <div class="space-y-2">
            <div class="flex items-baseline justify-between">
              <Label>功能</Label>
              <span class="text-xs text-muted-foreground">单选 · 必选</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              {#each functionItems as item (item.value)}
                {@const active = currentFunction === item.value}
                {@const Icon = item.icon}
                <button
                  type="button"
                  onclick={() => selectFunction(item.value)}
                  class={[
                    "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-all duration-200",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                      : "border-border/50 bg-background text-foreground hover:border-border hover:bg-muted",
                  ]}
                >
                  <Icon class="size-3.5" stroke={1.5} />
                  {item.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- 维度二 · 版本（互斥单选 · 可不选） -->
          <div class="space-y-2">
            <div class="flex items-baseline justify-between">
              <Label>版本</Label>
              <span class="text-xs text-muted-foreground">单选 · 可不选</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              {#each versionItems as item (item.value)}
                {@const active = currentVersion === item.value}
                {@const Icon = item.icon}
                <button
                  type="button"
                  onclick={() => selectVersion(item.value)}
                  class={[
                    "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-all duration-200",
                    active
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-600 shadow-sm dark:text-sky-400"
                      : "border-border/50 bg-background text-foreground hover:border-border hover:bg-muted",
                  ]}
                >
                  <Icon class="size-3.5" stroke={1.5} />
                  {item.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- 维度三 · 能力（依赖文本，多选） -->
          <div class="space-y-2" use:autoAnimate>
            {#if capabilityEnabled}
              <div class="flex items-baseline justify-between animate-fade-in">
                <Label>能力</Label>
                <span class="text-xs text-muted-foreground">可多选</span>
              </div>
              <div class="flex flex-wrap gap-1.5 animate-fade-in">
                {#each capabilityItems as item (item.value)}
                  {@const active = capabilitySelected.has(item.value)}
                  {@const Icon = item.icon}
                  <button
                    type="button"
                    onclick={() => toggleCapability(item.value)}
                    class={[
                      "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-all duration-200",
                      active
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 shadow-sm dark:text-emerald-400"
                        : "border-border/50 bg-background text-foreground hover:border-border hover:bg-muted",
                    ]}
                  >
                    <Icon class="size-3.5" stroke={1.5} />
                    {item.label}
                  </button>
                {/each}
              </div>
            {:else}
              <p class="text-xs text-muted-foreground animate-fade-in">
                选中「文本」功能后可进一步配置能力
              </p>
            {/if}
          </div>
        </div>
        <!-- ╭─── / AbilitySelector ───╮ -->

        <Separator class="bg-border/50" />

        <!-- 维度四、五、六 · 上下文 / 评分 -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="space-y-2">
            <Label for="dlg-inctx">最大输入</Label>
            <Input
              id="dlg-inctx"
              type="number"
              inputmode="numeric"
              value={inctx ?? ""}
              oninput={numHandler((v) => (inctx = v))}
              placeholder={formatTokens(DefInputToken)}
              class="rounded-xl tabular-nums"
              min="0"
            />
            <p class="text-xs text-muted-foreground">Tokens</p>
          </div>
          <div class="space-y-2">
            <Label for="dlg-outctx">最大输出</Label>
            <Input
              id="dlg-outctx"
              type="number"
              inputmode="numeric"
              value={outctx ?? ""}
              oninput={numHandler((v) => (outctx = v))}
              placeholder={formatTokens(DefOutputToken)}
              class="rounded-xl tabular-nums"
              min="0"
            />
            <p class="text-xs text-muted-foreground">Tokens</p>
          </div>
          <div class="space-y-2">
            <Label for="dlg-score">评分</Label>
            <Input
              id="dlg-score"
              type="number"
              inputmode="numeric"
              value={score ?? ""}
              oninput={numHandler((v) => (score = v))}
              placeholder={String(DefScore)}
              class="rounded-xl tabular-nums"
              min="0"
              max="100"
            />
            <p class="text-xs text-muted-foreground">0 - 100</p>
          </div>
        </div>
      </div>
    </Collapsible.Content>
  </Collapsible.Root>

  <!-- 错误提示 -->
  {#if errorMessage}
    <Alert.Root variant="destructive" class="rounded-xl">
      <IconAlertCircle class="size-4" stroke={1.5} />
      <Alert.Title>保存失败</Alert.Title>
      <Alert.Description>{errorMessage}</Alert.Description>
    </Alert.Root>
  {/if}
</div>

<DialogFooter class="mt-4">
  <Button
    variant="outline"
    size="sm"
    class="rounded-lg"
    onclick={() => onCancel()}
    disabled={isSubmitting}
  >
    取消
  </Button>
  <Button
    size="sm"
    class="rounded-lg"
    onclick={handleSubmit}
    disabled={!isValid || isSubmitting}
  >
    {#if isSubmitting}
      <IconLoader2 class="size-4 animate-spin" stroke={1.5} />
      保存中
    {:else}
      {isEditMode ? "保存更改" : "创建"}
    {/if}
  </Button>
</DialogFooter>
