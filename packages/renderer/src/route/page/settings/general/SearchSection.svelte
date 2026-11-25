<!-- packages/renderer/src/route/page/settings/general/SearchSection.svelte -->
<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  import { Separator } from "$lib/components/ui/separator";
  import { configStore } from "$lib/store/config.svelte";
  import { taskProgressStore } from "$lib/store/task-progress.svelte";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";
  import { longTaskStore } from "$lib/store/ui/longTask.svelte";
  import { safeApi } from "$lib/utils/api";
  import { FUNCTION_TAGS } from "$lib/utils/model/types";
  import type { AppConfig, TaskSnapshot } from "@app/main/types";
  import {
    IconArrowsSort,
    IconBrain,
    IconFileSearch,
    IconLoader2,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";
  import RuntimeProgress from "../code-runtime/RuntimeProgress.svelte";
  import SectionCard from "./SectionCard.svelte";

  // ═══════════════════════════════════════════════════════════
  // 任务 id —— 与主进程 libs/searchsrv/task-ids.ts 严格同步
  // ═══════════════════════════════════════════════════════════
  /**
   * 渲染进程只共享了主进程的**类型**，拿不到 libs 的运行时入口，因此这里
   * 复制一份常量。两边 id 必须成对修改：主进程据此广播 task:update，
   * 这里据此把同一份快照渲染成进度条与活动栏角标。
   * id 不一致**不会报错**，只会静默失去进度反馈，改的时候务必一起改。
   */
  const EMBEDDING_REINDEX_TASK_ID = "search:embedding-reindex";
  const FTS_REINDEX_TASK_ID = "search:fts-reindex";

  // ═══════════════════════════════════════════════════════════
  // 刷新通道
  // ═══════════════════════════════════════════════════════════
  type RefreshKind = "fts" | "embedding" | "rerank";

  const REFRESH_LABEL: Record<RefreshKind, string> = {
    fts: "全文检索索引",
    embedding: "嵌入索引",
    rerank: "重排模型",
  };

  /**
   * 服务端契约：先写配置（config.set / setEmbedModel / setReranModel），
   * 返回即代表已同步到服务器；随后调用对应 refreshXxx 启动派生状态更新。
   * refreshEmbedding / refreshFtsIndexes 会等待重建结束才返回，
   * 因此进度不能靠 RPC 判断，必须读 task:update 快照（见下方渲染）。
   */
  const refreshApi: Record<RefreshKind, () => Promise<unknown>> = {
    fts: () => safeApi().config.refreshFtsIndexes(),
    embedding: () => safeApi().config.refreshEmbedding(),
    rerank: () => safeApi().config.refreshRerank(),
  };

  let running = $state<Record<RefreshKind, boolean>>({
    fts: false,
    embedding: false,
    rerank: false,
  });

  /**
   * 统一的刷新驱动器。只负责“发起 + 成功提示 + 收尾”，不阻塞页面。
   * 失败路径由 safeApi 统一完成异常处理与用户反馈，这里不重复提示。
   */
  async function refresh(kind: RefreshKind): Promise<void> {
    if (running[kind]) return;
    running[kind] = true;
    try {
      const ok = await refreshApi[kind]();
      if (ok === true) {
        toast.success(`${REFRESH_LABEL[kind]}已更新`);
      }
    } finally {
      running[kind] = false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 候选值
  // ═══════════════════════════════════════════════════════════
  /**
   * 全文检索分词器候选。
   * `value` 必须落在主进程 `AppConfig['fts_tokenizer']` 的联合类型内：
   * 这里用显式类型收窄，写错会在编译期报错，而不是运行时被 schema 静默拒绝。
   * （若主进程实际只支持 jieba / simple 等取值，请按实际联合增删候选。）
   */
  const FTS_TOKENIZERS: {
    value: AppConfig["fts_tokenizer"];
    label: string;
    note: string;
  }[] = [
    {
      value: "jieba",
      label: "结巴分词（jieba）",
      note: "按中文词切分，中文资料的命中率最好（默认）。",
    },
    {
      value: "icu",
      label: "ICU 分词",
      note: "基于 Unicode 词典的跨语言分词，适合中英混排等混合语言文本；中文效果通常弱于 jieba。",
    },
    {
      value: "simple",
      label: "Simple 分词",
      note: "按空白与标点切分，适用于以英文为主的通用文本，也是 LanceDB 的默认分词器。",
    },
  ];

  type ModelOption = {
    value: string;
    label: string;
    note: string;
  };

  // ═══════════════════════════════════════════════════════════
  // 模型候选：只来自远端 Provider 的能力声明（本地 GGUF 已下线）
  // ═══════════════════════════════════════════════════════════
  const embeddingModels = $derived.by((): ModelOption[] =>
    configStore.providers
      .filter((provider) => provider.disabled !== true)
      .flatMap((provider) =>
        provider.models
          .filter((model) => model.abilities.includes(FUNCTION_TAGS.embedding))
          .map((model) => ({
            value: `::${provider.id}::${model.id}`,
            label: model.id,
            note: `远程嵌入模型 · ${provider.id}`,
          })),
      ),
  );

  const rerankModels = $derived.by((): ModelOption[] =>
    configStore.providers
      .filter((provider) => provider.disabled !== true)
      .flatMap((provider) =>
        provider.models
          .filter((model) => model.abilities.includes(FUNCTION_TAGS.rerank))
          .map((model) => ({
            value: `::${provider.id}::${model.id}`,
            label: model.id,
            note: `远程重排模型 · ${provider.id}`,
          })),
      ),
  );

  /** “不使用”始终可选：缺省即关闭该能力，不需要清空历史才能关。 */
  const embeddingOptions = $derived<ModelOption[]>([
    ...embeddingModels,
    {
      value: "",
      label: "不使用嵌入模型",
      note: "将失去语义检索能力，仅保留全文检索。",
    },
  ]);

  const rerankOptions = $derived<ModelOption[]>([
    ...rerankModels,
    {
      value: "",
      label: "不使用重排模型",
      note: "缺失重排会降低召回准确率与任务质量。",
    },
  ]);

  // ═══════════════════════════════════════════════════════════
  // 显示用派生值
  // ═══════════════════════════════════════════════════════════
  const ftsLabel = $derived(
    FTS_TOKENIZERS.find((option) => option.value === configStore.fts_tokenizer)
      ?.label ?? configStore.fts_tokenizer,
  );

  const embeddingLabel = $derived(
    embeddingOptions.find((option) => option.value === configStore.embedModel)
      ?.label ??
      (configStore.embedModel || "选择嵌入模型…"),
  );

  const rerankLabel = $derived(
    rerankOptions.find((option) => option.value === configStore.localModel)
      ?.label ??
      (configStore.localModel || "选择重排模型…"),
  );

  /**
   * 旧版本允许把本地 GGUF 路径直接写进配置，本版本只支持远程模型。
   * 这里**不做静默清空**（配置属于用户资产）：原值照常显示，另给一行
   * 提示，由用户显式重新选择。
   */
  const embeddingLegacy = $derived(
    configStore.embedModel.length > 0 &&
      !embeddingModels.some(
        (option) => option.value === configStore.embedModel,
      ),
  );

  const rerankLegacy = $derived(
    configStore.localModel.length > 0 &&
      !rerankModels.some((option) => option.value === configStore.localModel),
  );

  // ═══════════════════════════════════════════════════════════
  // 长时任务快照：进度条的唯一数据源
  // ═══════════════════════════════════════════════════════════
  function isTaskActive(task: TaskSnapshot | undefined): boolean {
    return task?.status === "pending" || task?.status === "running";
  }

  const ftsTask = $derived(taskProgressStore.get(FTS_REINDEX_TASK_ID));
  const embeddingTask = $derived(
    taskProgressStore.get(EMBEDDING_REINDEX_TASK_ID),
  );

  const ftsTaskActive = $derived(isTaskActive(ftsTask));
  const embeddingTaskActive = $derived(isTaskActive(embeddingTask));

  /**
   * 忙碌 = 任务在跑（进度可见） 或 RPC 尚未返回（快照可能还没到）。
   * 后者用于覆盖「RPC 已发出、task:update 未到达」的空窗，避免界面看起来没反应。
   */
  const ftsBusy = $derived(running.fts || ftsTaskActive);
  const embeddingBusy = $derived(running.embedding || embeddingTaskActive);

  /** 区块头 / 活动栏共用的角标数据源（App.svelte 注册了 "search:" 前缀）。 */
  const pendingReindex = $derived(longTaskStore.countFor("search"));

  // ═══════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════
  async function applyFtsTokenizer(value: string): Promise<void> {
    if (ftsBusy) return;
    if (value === configStore.fts_tokenizer) return;

    const confirmed = await confirmStore.request({
      title: "需要重建索引",
      message:
        "变更分词器后，全部全文检索索引都需要重建，期间检索结果可能不完整。确定要变更吗？",
      variant: "question",
    });
    if (!confirmed) return;

    await configStore.setConfig("fts_tokenizer", value);
    // setConfig 内部捕获异常并 toast，仅在写成功后才会回写本地状态；
    // 因此用状态比对判断是否真的落到服务器，避免失败后再去触发重建。
    if (configStore.fts_tokenizer !== value) return;

    await refresh("fts");
  }

  async function applyEmbeddingModel(value: string): Promise<void> {
    if (embeddingBusy) return;
    if (value === configStore.embedModel) return;

    if (configStore.embedModel.length > 0) {
      const confirmed = await confirmStore.request({
        title: "需要重建数据",
        message:
          "嵌入模型变更后，工具、技能与知识库的全部向量索引都需要重建，可能耗时较久。确定要变更嵌入模型吗？",
        variant: "question",
      });
      if (!confirmed) return;
    }

    await configStore.setEmbedModel(value);
    if (configStore.embedModel !== value) return;

    await refresh("embedding");
  }

  async function applyRerankModel(value: string): Promise<void> {
    if (running.rerank) return;

    const next = value.trim();
    if (next === configStore.localModel) return;

    await configStore.setReranModel(next);
    if (configStore.localModel !== next) return;

    await refresh("rerank");
  }
</script>

<SectionCard title="搜索配置" badge={pendingReindex}>
  <div
    class="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-border"
  >
    <!-- ── Row: 全文检索分词 ── -->
    <div class="space-y-3 p-6">
      <div
        class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-8"
      >
        <div class="flex items-center gap-4 min-w-0">
          <div
            class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
          >
            <IconFileSearch
              size={20}
              stroke={1.5}
              class="text-muted-foreground"
            />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-foreground">全文检索分词</p>
            <p class="text-xs text-muted-foreground mt-0.5">
              决定全文索引的切词方式，直接影响资料的检索命中率。
            </p>
          </div>
        </div>

        <div class="w-full lg:w-96 shrink-0">
          <Select.Root
            type="single"
            value={configStore.fts_tokenizer}
            onValueChange={(value) => {
              void applyFtsTokenizer(value);
            }}
          >
            <Select.Trigger class="w-full rounded-xl" disabled={ftsBusy}>
              <span class="truncate">{ftsLabel}</span>
            </Select.Trigger>
            <Select.Content class="rounded-xl max-h-80">
              {#each FTS_TOKENIZERS as option (option.value)}
                <Select.Item value={option.value} class="rounded-lg">
                  <div class="flex w-full min-w-0 flex-col gap-0.5">
                    <p class="truncate text-sm font-medium text-foreground">
                      {option.label}
                    </p>
                    <p class="truncate text-xs text-muted-foreground">
                      {option.note}
                    </p>
                  </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <!-- 长时任务进度：以主进程 task:update 快照为准 -->
      {#if ftsTaskActive}
        <RuntimeProgress
          progress={ftsTask?.progress ?? 0}
          message={ftsTask?.message}
        />
      {:else if running.fts}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <IconLoader2 class="size-3.5 shrink-0 animate-spin" />
          <span class="truncate">正在重建全文检索索引…</span>
        </div>
      {/if}
    </div>

    <Separator class="bg-border/30" />

    <!-- ── Row: 嵌入模型 ── -->
    <div class="space-y-3 p-6">
      <div
        class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-8"
      >
        <div class="flex items-center gap-4 min-w-0">
          <div
            class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
          >
            <IconBrain size={20} stroke={1.5} class="text-muted-foreground" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-foreground">嵌入模型</p>
            <p class="text-xs text-muted-foreground mt-0.5">
              按语义而非字面召回；召回多且仅相关性排序，无法排除无用内容。
            </p>
          </div>
        </div>

        <div class="w-full lg:w-96 shrink-0">
          <Select.Root
            type="single"
            value={configStore.embedModel}
            onValueChange={(value) => {
              void applyEmbeddingModel(value);
            }}
          >
            <Select.Trigger class="w-full rounded-xl" disabled={embeddingBusy}>
              <span class="truncate">{embeddingLabel}</span>
            </Select.Trigger>
            <Select.Content class="rounded-xl max-h-80">
              {#if embeddingModels.length === 0}
                <div
                  class="px-3 py-4 text-center text-xs leading-relaxed text-muted-foreground"
                >
                  尚未配置支持<b>嵌入</b>能力的模型。
                  <br />
                  请先在「AIGC 模型」中添加。
                </div>
              {/if}
              {#each embeddingOptions as option (option.value)}
                <Select.Item value={option.value} class="rounded-lg">
                  <div class="flex w-full min-w-0 flex-col gap-0.5">
                    <p class="truncate text-sm font-medium text-foreground">
                      {option.label}
                    </p>
                    <p class="truncate text-xs text-muted-foreground">
                      {option.note}
                    </p>
                  </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      {#if embeddingLegacy}
        <p class="text-xs leading-relaxed text-amber-600">
          当前配置的嵌入模型已不可用（本版本仅支持具备<b>嵌入</b
          >能力的远程模型），请重新选择。
        </p>
      {/if}

      {#if embeddingTaskActive}
        <RuntimeProgress
          progress={embeddingTask?.progress ?? 0}
          message={embeddingTask?.message}
        />
      {:else if running.embedding}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <IconLoader2 class="size-3.5 shrink-0 animate-spin" />
          <span class="truncate">正在重建嵌入索引…</span>
        </div>
      {/if}
    </div>

    <Separator class="bg-border/30" />

    <!-- ── Row: 重排模型 ── -->
    <div class="space-y-3 p-6">
      <div
        class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-8"
      >
        <div class="flex items-center gap-4 min-w-0">
          <div
            class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
          >
            <IconArrowsSort
              size={20}
              stroke={1.5}
              class="text-muted-foreground"
            />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-foreground">重排模型</p>
            <p class="text-xs text-muted-foreground mt-0.5">
              对初步召回结果重排打分，依分数断崖截断低分候选，提准确率并降Token。
            </p>
          </div>
        </div>

        <div class="w-full lg:w-96 shrink-0">
          <Select.Root
            type="single"
            value={configStore.localModel}
            onValueChange={(value) => {
              void applyRerankModel(value);
            }}
          >
            <Select.Trigger class="w-full rounded-xl" disabled={running.rerank}>
              <span class="truncate">{rerankLabel}</span>
            </Select.Trigger>
            <Select.Content class="rounded-xl max-h-80">
              {#if rerankModels.length === 0}
                <div
                  class="px-3 py-4 text-center text-xs leading-relaxed text-muted-foreground"
                >
                  尚未配置支持<b>重排</b>能力的模型。
                  <br />
                  请先在「AIGC 模型」中添加。
                </div>
              {/if}
              {#each rerankOptions as option (option.value)}
                <Select.Item value={option.value} class="rounded-lg">
                  <div class="flex w-full min-w-0 flex-col gap-0.5">
                    <p class="truncate text-sm font-medium text-foreground">
                      {option.label}
                    </p>
                    <p class="truncate text-xs text-muted-foreground">
                      {option.note}
                    </p>
                  </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      {#if rerankLegacy}
        <p class="text-xs leading-relaxed text-amber-600">
          当前配置的重排模型已不可用（本版本仅支持具备<b>重排</b
          >能力的远程模型），请重新选择。
        </p>
      {/if}

      <!-- 重排只替换内部缓存，无长时任务：等 RPC 返回即可 -->
      {#if running.rerank}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <IconLoader2 class="size-3.5 shrink-0 animate-spin" />
          <span class="truncate">正在切换重排模型…</span>
        </div>
      {/if}
    </div>
  </div>
</SectionCard>
