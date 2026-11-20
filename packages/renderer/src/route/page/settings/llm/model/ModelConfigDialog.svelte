<!-- ModelConfigDialog.svelte -->
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
    FUNCTION_CAPABILITIES,
    FUNCTION_CONTEXT_LABELS,
    FUNCTION_TAGS,
    IMAGE_FUNCTION_TAGS,
    VERSION_TAGS,
    VIDEO_FUNCTION_TAGS,
    type Model,
    type ModelAbility,
    type ModelOption,
  } from "$lib/utils/model/types";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconAlertCircle,
    IconChevronDown,
    IconFilter,
    IconLoader2,
    IconSparkles,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";
  import ComboboxSearch from "../combobox/ComboboxSearch.svelte";
  import type { ComboboxItem } from "../combobox/combobox.types";
  import { findPresetByBaseUrl } from "../providers";
  import AbilitySelector from "./AbilitySelector.svelte";
  import { fetchAvailableModels } from "./fetchModels";
  /* eslint-disable svelte/prefer-svelte-reactivity */

  type Props = {
    model?: Partial<Model>;
    existingModelIds?: string[];
    fetchCtx?: { baseUrl?: string; apiKey?: string };
    onSave?: (model: Model) => Promise<boolean>;
  } & DialogComponentProps<Model>;

  let {
    model,
    existingModelIds = [],
    fetchCtx,
    onSave,
    onClose,
    onCancel,
  }: Props = $props();

  const isEditMode = !!model?.id;

  function normalize(list: ModelAbility[]): ModelAbility[] {
    const functionSet = new Set(Object.values(FUNCTION_TAGS) as ModelAbility[]);
    const versionSet = new Set(Object.values(VERSION_TAGS) as ModelAbility[]);
    const allCapSet = new Set<ModelAbility>([
      ...(Object.values(CAPABILITY_TAGS) as ModelAbility[]),
      ...(Object.values(IMAGE_FUNCTION_TAGS) as ModelAbility[]),
      ...(Object.values(VIDEO_FUNCTION_TAGS) as ModelAbility[]),
    ]);
    let activeFunc: ModelAbility | undefined;
    let activeVersion: ModelAbility | undefined;
    const caps: ModelAbility[] = [];
    const seenCap = new Set<ModelAbility>();
    for (const a of list) {
      if (functionSet.has(a)) activeFunc = a;
      else if (versionSet.has(a)) activeVersion = a;
      else if (allCapSet.has(a) && !seenCap.has(a)) {
        seenCap.add(a);
        caps.push(a);
      }
    }
    const result: ModelAbility[] = [];
    if (activeFunc) result.push(activeFunc);
    if (activeVersion) result.push(activeVersion);
    const allowed = new Set(
      (activeFunc && FUNCTION_CAPABILITIES[activeFunc]) || [],
    );
    result.push(...caps.filter((c) => allowed.has(c)));
    return result;
  }

  type Preset = NonNullable<ModelOption["preset"]>;

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

  let isSubmitting = $state(false);
  let errorMessage = $state("");
  let filterOpen = $state(true);
  let isDetecting = $state(false);

  const staticModels = $derived.by(() => {
    const preset = findPresetByBaseUrl(fetchCtx?.baseUrl);
    return preset?.models;
  });

  const hasStaticModels = $derived(
    staticModels !== undefined && staticModels.length > 0,
  );

  // ── 内部 fetch 通路（仅在无静态模型清单时启用）──
  let fetchedModels = $state<ModelOption[]>([]);
  let isFetchingModels = $state(false);
  let fetchModelsFailed = $state(false);
  let modelsLoadAttempted = $state(false);

  async function loadModels() {
    if (isFetchingModels) return;
    isFetchingModels = true;
    fetchModelsFailed = false;
    try {
      fetchedModels = await fetchAvailableModels(fetchCtx ?? {});
    } catch {
      fetchModelsFailed = true;
      fetchedModels = [];
    } finally {
      isFetchingModels = false;
    }
  }

  function tryLoadOnce() {
    if (hasStaticModels || modelsLoadAttempted || isFetchingModels) return;
    modelsLoadAttempted = true;
    void loadModels();
  }

  function retryLoadModels() {
    if (isFetchingModels) return;
    modelsLoadAttempted = false;
    void loadModels();
  }

  function handleComboboxOpenChange(next: boolean) {
    if (next) tryLoadOnce();
  }

  const modelOptions = $derived(
    hasStaticModels ? (staticModels as ModelOption[]) : fetchedModels,
  );
  const modelsLoading = $derived(hasStaticModels ? false : isFetchingModels);
  const modelsFailed = $derived(hasStaticModels ? false : fetchModelsFailed);

  // 转成 ComboboxSearch 所需的通用条目
  const comboboxItems = $derived<ComboboxItem[]>(
    modelOptions.map((o) => ({
      id: o.id,
      label: getLabel(o),
      description: o.description,
      group: o.group ?? "",
    })),
  );

  function applyPreset(p: Preset | undefined) {
    if (!p) return;
    if (p.abilities) abilities = normalize([...p.abilities]);
    if (p.inctx != null) inctx = p.inctx;
    if (p.outctx != null) outctx = p.outctx;
    if (p.score != null) score = p.score;
    filterOpen = true;
  }

  function handleModelSelect(option: ModelOption) {
    id = option.id;
    let preset: Preset | undefined = option.preset;
    if (!preset) preset = autoDetectPreset(id.trim());
    applyPreset(preset);
  }

  function handleComboboxSelect(item: ComboboxItem) {
    const option = modelOptions.find((o) => o.id === item.id);
    if (option) handleModelSelect(option);
  }

  function autoDetectPreset(modelId: string): Preset | undefined {
    const info = parseModel(modelId);
    if (!info) return undefined;
    const ret: Preset = {
      abilities: info.abilities,
      score: info.score ?? 50,
    };
    if (info.inctx) ret.inctx = info.inctx;
    if (info.outctx) ret.outctx = info.outctx;
    return ret;
  }

  function handleAutoDetect() {
    if (isDetecting) return;
    isDetecting = true;
    let detectError = "";
    try {
      const preset = autoDetectPreset(id.trim());
      if (preset) applyPreset(preset);
      else detectError = `未能识别出模型"${id.trim()}"的推荐配置`;
    } catch (e) {
      detectError = e instanceof Error ? e.message : "识别失败，请重试";
    } finally {
      isDetecting = false;
    }
    if (detectError) toast.error(detectError);
  }

  function getLabel(option: ModelOption): string {
    return option.label || option.id;
  }

  const currentFunction = $derived(
    abilities.find((a) =>
      (Object.values(FUNCTION_TAGS) as ModelAbility[]).includes(a),
    ),
  );

  const duplicateIdError = $derived.by(() => {
    const trimmed = id.trim();
    if (!trimmed) return "";
    if (existingModelIds.includes(trimmed)) {
      return `该提供商下已存在同名模型「${trimmed}」，请换一个模型。`;
    }
    return "";
  });

  const isValid = $derived(
    id.trim().length > 0 && !!currentFunction && duplicateIdError === "",
  );

  const currentCtxLabels = $derived(
    (currentFunction && FUNCTION_CONTEXT_LABELS[currentFunction]) || {
      inctxLabel: "最大输入",
      inctxHint: "Tokens",
      outctxLabel: "最大输出",
      outctxHint: "Tokens",
      showInctx: true,
      showOutctx: true,
    },
  );

  const ctxGridCols = $derived(
    (currentCtxLabels.showInctx ? 1 : 0) +
      (currentCtxLabels.showOutctx ? 1 : 0) +
      1,
  );

  function numHandler(setter: (v: number | undefined) => void) {
    return (e: Event) => {
      const raw = (e.currentTarget as HTMLInputElement).value;
      const num = raw === "" ? undefined : Number(raw);
      setter(num != null && !Number.isNaN(num) ? num : undefined);
    };
  }

  async function handleSubmit() {
    if (!isValid || isSubmitting) return;

    if (duplicateIdError) {
      toast.error(duplicateIdError);
      document.getElementById("dlg-model-id")?.focus();
      return;
    }

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
      if (onSave && (await onSave(result))) return;
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
  <div class="space-y-4">
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ 合并输入框：搜索下拉 + 自由输入（复用 ComboboxSearch） │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <div class="space-y-2">
      <Label for="dlg-model-id">模型标识 (ID)</Label>
      <ComboboxSearch
        bind:value={id}
        items={comboboxItems}
        selectedValue={id.trim()}
        placeholder="搜索或输入模型名称…"
        emptyText="未找到匹配的模型，回车或点对勾可直接使用当前输入"
        shouldFilter
        loading={modelsLoading}
        failed={modelsFailed}
        loadingText="正在获取可用模型…"
        failedText="无法获取列表"
        onRetry={retryLoadModels}
        onSelect={handleComboboxSelect}
        onOpenChange={handleComboboxOpenChange}
      />
      <!-- 错误区预留空间：防止对话框高度抖动 -->
      <div class="min-h-5">
        {#if duplicateIdError}
          <p
            id="dlg-model-id-err"
            class="animate-fade-in text-xs text-destructive"
          >
            {duplicateIdError}
          </p>
        {/if}
      </div>
    </div>
  </div>

  <!-- 筛选条件（未改动） -->
  <Collapsible.Root
    bind:open={filterOpen}
    class="rounded-2xl border border-border/50 bg-muted/20"
  >
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
      <Button
        variant="outline"
        size="sm"
        class="h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs"
        onclick={handleAutoDetect}
        disabled={isDetecting || id.trim().length === 0}
      >
        {#if isDetecting}
          <IconLoader2 class="size-3.5 animate-spin" stroke={1.5} />识别中
        {:else}
          <IconSparkles class="size-3.5" stroke={1.5} />自动识别
        {/if}
      </Button>
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
        <AbilitySelector bind:abilities />

        <Separator class="bg-border/50" />

        <div
          class={[
            "grid grid-cols-1 gap-4",
            ctxGridCols >= 2 && "sm:grid-cols-2",
            ctxGridCols >= 3 && "sm:grid-cols-3",
          ]}
        >
          {#if currentCtxLabels.showInctx}
            <div class="space-y-2">
              <Label for="dlg-inctx">{currentCtxLabels.inctxLabel}</Label>
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
              <p class="text-xs text-muted-foreground">
                {currentCtxLabels.inctxHint}
              </p>
            </div>
          {/if}
          {#if currentCtxLabels.showOutctx}
            <div class="space-y-2">
              <Label for="dlg-outctx">{currentCtxLabels.outctxLabel}</Label>
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
              <p class="text-xs text-muted-foreground">
                {currentCtxLabels.outctxHint}
              </p>
            </div>
          {/if}
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
      <IconLoader2 class="size-4 animate-spin" stroke={1.5} />保存中
    {:else}
      {isEditMode ? "保存更改" : "创建"}
    {/if}
  </Button>
</DialogFooter>
