<script lang="ts">
  import {
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Separator } from "$lib/components/ui/separator";
  import * as Alert from "$lib/components/ui/alert";
  import {
    IconAlertCircle,
    IconAlertTriangle,
    IconLoader2,
    IconFilter,
  } from "@tabler/icons-svelte";
  import autoAnimate from "@formkit/auto-animate";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import {
    type Model,
    type ModelOption,
    type ModelAbility,
    abilityLabels,
    abilityIcons,
    ALL_ABILITIES,
    allAbilities,
    formatTokens,
  } from "../types";
  import ModelSelectCombobox from "./ModelSelectCombobox.svelte";
  import MultiToggleGroup from "./MultiToggleGroup.svelte";
  import { fetchAvailableModels } from "./fetchModels";
  import {
    DefInputToken,
    DefOutputToken,
    DefScore,
  } from "$lib/store/config.svelte";

  /* ─── Props ─── */
  type Props = {
    model?: Partial<Model>;
    /** 拉取可用模型列表的上下文（透传给 fetchAvailableModels） */
    fetchCtx?: { baseUrl?: string; apiKey?: string };
    onSave?: (model: Model) => Promise<void>;
  } & DialogComponentProps<Model>;

  let { model, fetchCtx, onSave, onClose, onCancel }: Props = $props();

  const isEditMode = !!model?.id;

  /* ─── 表单状态 ───
     能力即输入能力，默认选中文本；输出固定为文本（在别处配置）。
     能力 / 上下文 / 评分 共同构成运行期筛选模型的条件。 */
  let id = $state(model?.id ?? "");
  let abilities = $state<ModelAbility[]>(
    model?.abilities ?? [allAbilities.text,allAbilities.func,allAbilities.reasoning],
  );
  let inctx = $state<number | undefined>(model?.inctx);
  let outctx = $state<number | undefined>(model?.outctx);
  let score = $state<number | undefined>(model?.score);

  let selectedModelId = $state(model?.id ?? "");

  /* ─── 加载 / UI 状态 ─── */
  let options = $state<ModelOption[]>([]);
  let isLoadingModels = $state(true);
  let loadFailed = $state(false);

  let isSubmitting = $state(false);
  let errorMessage = $state("");

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

  /* ─── 选中模型 → 自动填充 ─── */
  function handleModelSelect(option: ModelOption) {
    selectedModelId = option.id;
    id = option.id;

    const p = option.preset;
    if (p) {
      if (p.abilities) abilities = [...p.abilities];
      if (p.inctx != null) inctx = p.inctx;
      if (p.outctx != null) outctx = p.outctx;
      if (p.score != null) score = p.score;
    }
  }

  /* ─── 多选切换 ─── */
  function toggle<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  /* ─── 选择项数据 ─── */
  const abilityItems = ALL_ABILITIES.map((a) => ({
    value: a,
    label: abilityLabels[a],
    icon: abilityIcons[a],
  }));

  /* ─── 数字输入辅助 ─── */
  function numHandler(setter: (v: number | undefined) => void) {
    return (e: Event) => {
      const raw = (e.currentTarget as HTMLInputElement).value;
      const num = raw === "" ? undefined : Number(raw);
      setter(num != null && !Number.isNaN(num) ? num : undefined);
    };
  }

  /* ─── 校验 ─── */
  const isValid = $derived(id.trim().length > 0 && abilities.length > 0);

  /* ─── 提交 ─── */
  async function handleSubmit() {
    if (!isValid || isSubmitting) return;
    isSubmitting = true;
    errorMessage = "";

    const result: Model = {
      id: id.trim(),
      abilities,
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
      <IconAlertTriangle class="size-4 text-amber-500" />
      <Alert.Title>无法自动获取模型列表</Alert.Title>
      <Alert.Description>
        可能是 API Key 或接口地址有误。你仍可在下方手动填写模型标识并保存。
      </Alert.Description>
    </Alert.Root>
  {/if}

  <!-- ── 区块一 · 模型标识（与筛选条件视觉分离）── -->
  <div class="space-y-4">
    <!-- 自动获取失败时不再展示下拉，避免误导 -->
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

  <!-- ── 区块二 · 筛选条件（能力 / 上下文 / 评分，统一面板）── -->
  <div class="space-y-5 rounded-2xl border border-border/50 bg-muted/20 p-6">
    <div class="space-y-1">
      <h3 class="flex items-center gap-2 text-base font-medium">
        <IconFilter class="size-4 text-muted-foreground" />
        筛选条件
      </h3>
      <p class="text-xs text-muted-foreground">
        运行期将依据以下维度匹配合适的模型
      </p>
    </div>

    <Separator class="bg-border/50" />

    <!-- 维度一 · 能力 -->
    <div class="space-y-2">
      <div class="flex items-baseline justify-between">
        <Label>能力</Label>
        <span class="text-xs text-muted-foreground">至少选择一项</span>
      </div>
      <MultiToggleGroup
        items={abilityItems}
        selected={abilities}
        onToggle={(v) => (abilities = toggle(abilities, v))}
      />
    </div>

    <!-- 维度二、三 · 上下文 / 评分 -->
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

  <!-- 错误提示 -->
  {#if errorMessage}
    <Alert.Root variant="destructive" class="rounded-xl">
      <IconAlertCircle class="size-4" />
      <Alert.Title>保存失败</Alert.Title>
      <Alert.Description>{errorMessage}</Alert.Description>
    </Alert.Root>
  {/if}
</div>

<DialogFooter class="mt-4">
  <Button variant="outline" onclick={() => onCancel()} disabled={isSubmitting}>
    取消
  </Button>
  <Button onclick={handleSubmit} disabled={!isValid || isSubmitting}>
    {#if isSubmitting}
      <IconLoader2 class="size-4 animate-spin" />
      保存中
    {:else}
      {isEditMode ? "保存更改" : "创建"}
    {/if}
  </Button>
</DialogFooter>
