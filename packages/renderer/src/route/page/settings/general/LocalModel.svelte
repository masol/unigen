<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  import { Separator } from "$lib/components/ui/separator";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { configStore } from "$lib/store/config.svelte";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import { api } from "$lib/utils/api";
  import { FUNCTION_TAGS } from "$lib/utils/model/types";
  import {
    IconArrowsSort,
    IconBrain,
    IconFolderOpen,
    IconLoader2,
  } from "@tabler/icons-svelte";
  import { onMount } from "svelte";

  // ═══════════════════════════════════════════════════════════
  // Reactive bindings
  // ═══════════════════════════════════════════════════════════
  let embeddingModel = $derived(configStore.embedModel);
  let rerankModel = $derived(configStore.localModel);

  // ═══════════════════════════════════════════════════════════
  // Model lists state
  // ═══════════════════════════════════════════════════════════
  let embeddingModels = $state<
    Array<{ value: string; label: string; note: string }>
  >([]);
  let embeddingLoading = $state(false);
  let embeddingFetched = $state(false);

  let rerankModels = $state<
    Array<{ value: string; label: string; note: string }>
  >([]);
  let rerankLoading = $state(false);
  let rerankFetched = $state(false);

  // ═══════════════════════════════════════════════════════════
  // 每次进入重置缓存标记（热更新 / 组件复用场景下保险）
  // ═══════════════════════════════════════════════════════════
  onMount(() => {
    embeddingFetched = false;
    embeddingLoading = false;
    rerankFetched = false;
    rerankLoading = false;
  });

  // ═══════════════════════════════════════════════════════════
  // Computed selected items for display
  // ═══════════════════════════════════════════════════════════
  let selectedEmbeddingLabel = $derived(
    embeddingModels.find((m) => m.value === embeddingModel)?.label ||
      embeddingModel,
  );
  let selectedRerankLabel = $derived(
    rerankModels.find((m) => m.value === rerankModel)?.label || rerankModel,
  );

  // ═══════════════════════════════════════════════════════════
  // Embedding
  // ═══════════════════════════════════════════════════════════
  async function handleEmbeddingOpen(open: boolean) {
    if (open && !embeddingFetched && !embeddingLoading) {
      embeddingLoading = true;
      try {
        embeddingModels = (await api().config.getEmbedings()).map((item) => ({
          value: item.value,
          label: item.label,
          note: "本地模型",
        }));
        configStore.providers.forEach((provider) => {
          provider.models.forEach((model) => {
            if (model.abilities.includes(FUNCTION_TAGS.embedding)) {
              embeddingModels.push({
                value: `::${provider.id}::${model.id}`,
                label: model.id,
                note: "远程嵌入模型",
              });
            }
          });
        });

        // ✅ 始终提供"不使用"选项，格式与 rerank 对齐
        if (!embeddingModels.some((m) => m.value === "")) {
          embeddingModels.push({
            value: "",
            label: "不使用嵌入模型",
            note: "会失去语义检索能力，降级为纯全文检索。",
          });
        }
        embeddingFetched = true;

        // 当前值已不在列表中 → 回退（空值选项已在列表内，故不会误清空）
        if (
          configStore.embedModel.length > 0 &&
          !embeddingModels.some((m) => m.value === configStore.embedModel)
        ) {
          configStore.setEmbedModel("");
        }
      } catch (error) {
        console.error("Failed to fetch embedding models:", error);
        embeddingModels = [];
      } finally {
        embeddingLoading = false;
      }
    }
  }

  async function handleEmbeddingChange(value: string) {
    if (value === configStore.embedModel) return;

    if (configStore.embedModel.length > 0) {
      const confirmed = await confirmStore.request({
        title: "需要重建数据",
        message:
          "嵌入模型变更，需要重建全部工具，技能以及知识库的嵌入向量，您确定要变更嵌入模型吗？",
        variant: "question",
      });
      if (!confirmed) return;
    }
    await configStore.setEmbedModel(value);
  }

  async function openEmbeddingModelDirectory() {
    const targetPath = await api().system.getPath({
      name: "embeding",
      create: true,
    });
    if (targetPath) {
      await api().system.showItemInFolder({ path: targetPath });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Rerank
  // ═══════════════════════════════════════════════════════════
  async function handleTextOpen(open: boolean) {
    if (open && !rerankFetched && !rerankLoading) {
      rerankLoading = true;
      try {
        rerankModels = (await api().config.getReranks()).map((item) => ({
          value: item.value,
          label: item.label,
          note: "本地模型",
        }));
        configStore.providers.forEach((provider) => {
          provider.models.forEach((model) => {
            if (model.abilities.includes(FUNCTION_TAGS.rerank)) {
              rerankModels.push({
                value: `::${provider.id}::${model.id}`,
                label: model.id,
                note: "远程重排模型",
              });
            }
          });
        });

        // 始终提供"不使用"选项，不依赖是否已有本地模型
        if (!rerankModels.some((m) => m.value === "")) {
          rerankModels.push({
            value: "",
            label: "不使用重排模型",
            note: "缺失重排会降低召回准确率与任务质量。",
          });
        }
        rerankFetched = true;

        // 当前值已不在列表中 → 回退
        if (
          configStore.localModel.length > 0 &&
          !rerankModels.some((m) => m.value === configStore.localModel)
        ) {
          configStore.setReranModel("");
        }
      } catch (error) {
        console.error("Failed to fetch text models:", error);
        rerankModels = [];
      } finally {
        rerankLoading = false;
      }
    }
  }

  function handleRerankChange(realValue: string) {
    const value = realValue.trim();
    if (value !== configStore.localModel) {
      configStore.setReranModel(value);
    }
  }

  async function openRerankDirectory() {
    const targetPath = await api().system.getPath({
      name: "rerank",
      create: true,
    });
    if (targetPath) {
      await api().system.showItemInFolder({ path: targetPath });
    }
  }
</script>

<section class="space-y-4">
  <h2 class="text-lg font-medium text-foreground px-1">搜索配置</h2>
  <div
    class="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-border"
  >
    <!-- ── Row: 本地嵌入模型 ── -->
    <div
      class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-8 p-6"
    >
      <div class="flex items-center gap-4 shrink-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconBrain size={20} stroke={1.5} class="text-muted-foreground" />
        </div>
        <div>
          <p class="text-sm font-medium text-foreground">嵌入模型</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            可选本地模型，或具有<b>嵌入</b>能力的远程模型。
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 w-full lg:w-96 shrink-0">
        <Select.Root
          type="single"
          bind:value={() => embeddingModel, (v) => handleEmbeddingChange(v)}
          onValueChange={handleEmbeddingChange}
          onOpenChange={handleEmbeddingOpen}
        >
          <Select.Trigger class="min-w-0 flex-1 rounded-xl">
            <span class="truncate">
              {selectedEmbeddingLabel || "选择嵌入模型…"}
            </span>
          </Select.Trigger>
          <Select.Content class="rounded-xl max-h-80">
            {#if embeddingLoading}
              <div
                class="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
              >
                <IconLoader2 size={16} stroke={1.5} class="animate-spin" />
                <span>正在加载模型列表…</span>
              </div>
            {:else if embeddingModels.length === 0}
              <div class="py-8 text-center text-sm text-muted-foreground">
                无可用嵌入模型,请下载模型文件并存入右侧目录
                <br />
                或者设置有<b>嵌入</b>能力的模型。
              </div>
            {:else}
              {#each embeddingModels as model (model.value)}
                <Select.Item value={model.value} class="rounded-lg">
                  <div class="flex items-center justify-between gap-3 w-full">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-foreground">
                        {model.label}
                      </p>
                      <p class="text-xs text-muted-foreground">
                        {model.note}
                      </p>
                    </div>
                  </div>
                </Select.Item>
              {/each}
            {/if}
          </Select.Content>
        </Select.Root>

        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="flex items-center justify-center size-9 rounded-xl border border-input bg-background text-muted-foreground transition-all duration-200 hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                onclick={openEmbeddingModelDirectory}
              >
                <IconFolderOpen size={16} stroke={1.5} />
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>打开模型目录</Tooltip.Content>
        </Tooltip.Root>
      </div>
      <!--╭─── / AsyncModelSelect ───╮ -->
    </div>

    <Separator class="bg-border/30" />

    <!-- ── Row: 本地Rerank模型 ── -->
    <div
      class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-8 p-6"
    >
      <div class="flex items-center gap-4 shrink-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconArrowsSort
            size={20}
            stroke={1.5}
            class="text-muted-foreground"
          />
        </div>
        <div>
          <p class="text-sm font-medium text-foreground">重排模型</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            可自行下载 GGUF 模型，存放至右侧目录
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 w-full lg:w-96 shrink-0">
        <Select.Root
          type="single"
          value={rerankModel}
          onValueChange={handleRerankChange}
          onOpenChange={handleTextOpen}
        >
          <Select.Trigger class="min-w-0 flex-1 rounded-xl">
            <span class="truncate">
              {selectedRerankLabel || "选择重排模型…"}
            </span>
          </Select.Trigger>
          <Select.Content class="rounded-xl max-h-80">
            {#if rerankLoading}
              <div
                class="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
              >
                <IconLoader2 size={16} stroke={1.5} class="animate-spin" />
                <span>正在加载模型列表…</span>
              </div>
            {:else if rerankModels.length === 0}
              <div class="py-8 text-center text-sm text-muted-foreground">
                无有效重排模型,请设置远端或本地模型
              </div>
            {:else}
              {#each rerankModels as model (model.value)}
                <Select.Item value={model.value} class="rounded-lg">
                  <div class="flex items-center justify-between gap-3 w-full">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-foreground">
                        {model.label}
                      </p>
                      <p class="text-xs text-muted-foreground">
                        {model.note}
                      </p>
                    </div>
                  </div>
                </Select.Item>
              {/each}
            {/if}
          </Select.Content>
        </Select.Root>

        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="flex items-center justify-center size-9 rounded-xl border border-input bg-background text-muted-foreground transition-all duration-200 hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                onclick={openRerankDirectory}
              >
                <IconFolderOpen size={16} stroke={1.5} />
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>打开模型目录</Tooltip.Content>
        </Tooltip.Root>
      </div>
    </div>
  </div>
</section>
