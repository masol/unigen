<script lang="ts">
  import {
    IconDownload,
    IconChevronDown,
    IconCheck,
    IconBrain,
    IconLoader2,
    IconCircleCheck,
    IconCircleX,
    IconStarFilled,
    IconMessageChatbot,
  } from "@tabler/icons-svelte";
  import { Input } from "$lib/components/ui/input";
  import * as Popover from "$lib/components/ui/popover";
  import { Separator } from "$lib/components/ui/separator";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { configStore } from "$lib/store/config.svelte";
  import { cn } from "$lib/utils/index";

  // ═══════════════════════════════════════════════════════════
  // Reactive bindings — $derived is writable in Svelte 5:
  //   • bind:value writes to it locally (user typing)
  //   • when configStore.xxx changes externally, it re-derives
  //   • on blur we push the local value back to the store
  // ═══════════════════════════════════════════════════════════
  let modelSource = $derived(configStore.modelEndpoint);
  let embeddingModel = $derived(configStore.embedModel);
  let textModel = $derived(configStore.localModel);

  let sourceDropdown = $state(false);
  let embeddingDropdown = $state(false);
  let textDropdown = $state(false);

  let embeddingStatus = $state<"idle" | "checking" | "success" | "error">(
    "idle",
  );
  let textStatus = $state<"idle" | "checking" | "success" | "error">("idle");

  const SOURCE_PRESETS = [
    {
      value: "https://huggingface.co",
      label: "Hugging Face",
      note: "官方源(留空默认)",
    },
    {
      value: "https://hf-mirror.com",
      label: "HF Mirror",
      note: "国内镜像，高速下载",
    },
    {
      value: "https://modelscope.cn",
      label: "ModelScope",
      note: "魔搭社区，阿里云",
    },
    { value: "https://ai.gitee.com", label: "Gitee AI", note: "码云 AI 平台" },
  ];

  const EMBEDDING_PRESETS = [
    {
      value: "BAAI/bge-large-zh-v1.5",
      label: "BGE Large ZH v1.5",
      note: "中文优化，768 维",
    },
    { value: "BAAI/bge-m3", label: "BGE M3", note: "多语言，1024 维" },
    {
      value: "nomic-ai/nomic-embed-text-v1.5",
      label: "Nomic Embed v1.5",
      note: "通用英文，768 维",
    },
    {
      value: "sentence-transformers/all-MiniLM-L6-v2",
      label: "All-MiniLM L6 v2",
      note: "轻量级，384 维",
    },
  ];

  const TEXT_PRESETS = [
    {
      value: "Qwen/Qwen2.5-7B-Instruct",
      label: "Qwen 2.5 7B Instruct",
      note: "推荐，中英双语",
    },
    {
      value: "Qwen/Qwen2.5-14B-Instruct",
      label: "Qwen 2.5 14B Instruct",
      note: "高质量，需较大显存",
    },
    {
      value: "meta-llama/Llama-3.1-8B-Instruct",
      label: "Llama 3.1 8B Instruct",
      note: "英文优化，Meta 出品",
    },
    {
      value: "deepseek-ai/DeepSeek-V2-Lite-Chat",
      label: "DeepSeek V2 Lite",
      note: "高效 MoE 架构",
    },
    {
      value: "THUDM/glm-4-9b-chat",
      label: "GLM-4 9B Chat",
      note: "清华智谱，中文优化",
    },
  ];

  // ═══════════════════════════════════════════════════════════
  // Blur handlers — push local edits to store
  // ═══════════════════════════════════════════════════════════
  function handleSourceBlur() {
    configStore.setModelEndpoint(modelSource);
  }

  function handleEmbeddingBlur() {
    configStore.setEmbedModel(embeddingModel);
  }

  function handleTextBlur() {
    configStore.setLocalModel(textModel);
  }

  // ═══════════════════════════════════════════════════════════
  // Preset selection — immediately commit to store
  // (store update → $derived re-evaluates → input synced)
  // ═══════════════════════════════════════════════════════════
  function selectSource(value: string) {
    configStore.setModelEndpoint(value);
    sourceDropdown = false;
  }

  function selectEmbedding(value: string) {
    configStore.setEmbedModel(value);
    embeddingDropdown = false;
  }

  function selectText(value: string) {
    configStore.setLocalModel(value);
    textDropdown = false;
  }

  // ═══════════════════════════════════════════════════════════
  // Model availability check
  // ═══════════════════════════════════════════════════════════
  async function handleCheckModel(type: "embedding" | "text") {
    if (type === "embedding") {
      if (embeddingStatus === "checking") return;
      embeddingStatus = "checking";
      await new Promise((r) => setTimeout(r, 1800));
      embeddingStatus = configStore.embedModel.trim() ? "success" : "error";
      setTimeout(() => {
        embeddingStatus = "idle";
      }, 3000);
    } else {
      if (textStatus === "checking") return;
      textStatus = "checking";
      await new Promise((r) => setTimeout(r, 1800));
      textStatus = configStore.localModel.trim() ? "success" : "error";
      setTimeout(() => {
        textStatus = "idle";
      }, 3000);
    }
  }
</script>

<section class="space-y-4">
  <h2 class="text-lg font-medium text-foreground px-1">模型配置</h2>
  <div
    class="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-border"
  >
    <!-- ── Row: 模型下载点 ── -->
    <div
      class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-8 p-6"
    >
      <div class="flex items-center gap-4 shrink-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconDownload size={20} stroke={1.5} class="text-muted-foreground" />
        </div>
        <div>
          <p class="text-sm font-medium text-foreground">模型下载点</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            指定模型文件的下载来源地址
          </p>
        </div>
      </div>
      <!--╭─────────────────────────────────────────────────────╮ -->
      <!-- │ [可抽取子组件 → EditableSelect.svelte]             │ -->
      <!-- │ 职责：支持自由输入与下拉预设的组合选择器           │ -->
      <!-- ╰─────────────────────────────────────────────────────╯ -->
      <div class="flex items-center gap-2 w-full lg:w-96 shrink-0">
        <Input
          bind:value={modelSource}
          onblur={handleSourceBlur}
          placeholder="输入下载源地址…"
          class="min-w-0 flex-1 rounded-xl"
        />
        <Popover.Root bind:open={sourceDropdown}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="flex items-center justify-center size-9 rounded-xl border border-input bg-background transition-all duration-200 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
              >
                <IconChevronDown
                  size={16}
                  stroke={1.5}
                  class={cn(
                    "text-muted-foreground transition-transform duration-200",
                    textDropdown && "rotate-180",
                  )}
                />
              </button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content
            align="end"
            sideOffset={6}
            class="rounded-xl p-1.5 w-80"
          >
            <div class="space-y-0.5">
              {#each SOURCE_PRESETS as preset (preset.value)}
                <button
                  class={[
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all duration-200 hover:bg-accent",
                    modelSource === preset.value && "bg-accent",
                  ]}
                  onclick={() => selectSource(preset.value)}
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-foreground">
                      {preset.label}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {preset.note}
                    </p>
                  </div>
                  {#if modelSource === preset.value}
                    <IconCheck
                      size={16}
                      stroke={1.5}
                      class="text-primary shrink-0"
                    />
                  {/if}
                </button>
              {/each}
            </div>
          </Popover.Content>
        </Popover.Root>
      </div>
      <!-- ╭─── / EditableSelect ───╮ -->
    </div>

    <Separator class="bg-border/30" />

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
          <p class="text-sm font-medium text-foreground">本地嵌入模型</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            用于文本向量化的 Embedding 模型
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 w-full lg:w-96 shrink-0">
        <Input
          bind:value={embeddingModel}
          onblur={handleEmbeddingBlur}
          placeholder="输入或选择嵌入模型…"
          class="min-w-0 flex-1 rounded-xl"
        />
        <Popover.Root bind:open={embeddingDropdown}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="flex items-center justify-center size-9 rounded-xl border border-input bg-background transition-all duration-200 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
              >
                <IconChevronDown
                  size={16}
                  stroke={1.5}
                  class={cn(
                    "text-muted-foreground transition-transform duration-200",
                    embeddingDropdown && "rotate-180",
                  )}
                />
              </button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content
            align="end"
            sideOffset={6}
            class="rounded-xl p-1.5 w-80"
          >
            <div class="space-y-0.5">
              {#each EMBEDDING_PRESETS as preset (preset.value)}
                <button
                  class={[
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all duration-200 hover:bg-accent",
                    embeddingModel === preset.value && "bg-accent",
                  ]}
                  onclick={() => selectEmbedding(preset.value)}
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-foreground">
                      {preset.label}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {preset.note}
                    </p>
                  </div>
                  {#if embeddingModel === preset.value}
                    <IconCheck
                      size={16}
                      stroke={1.5}
                      class="text-primary shrink-0"
                    />
                  {/if}
                </button>
              {/each}
            </div>
          </Popover.Content>
        </Popover.Root>
        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → ModelCheckButton.svelte]            │ -->
        <!-- │ 职责：模型可用性检测按钮，含多态图标反馈           │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class={[
                  "flex items-center justify-center size-9 rounded-xl border bg-background transition-all duration-200 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0",
                  embeddingStatus === "success" &&
                    "border-primary/50 text-primary",
                  embeddingStatus === "error" &&
                    "border-destructive/50 text-destructive",
                  embeddingStatus !== "success" &&
                    embeddingStatus !== "error" &&
                    "border-input text-muted-foreground",
                  embeddingStatus === "checking" &&
                    "pointer-events-none opacity-70",
                ]}
                disabled={embeddingStatus === "checking"}
                onclick={() => handleCheckModel("embedding")}
              >
                {#if embeddingStatus === "checking"}
                  <IconLoader2 size={16} stroke={1.5} class="animate-spin" />
                {:else if embeddingStatus === "success"}
                  <IconCircleCheck size={16} stroke={1.5} />
                {:else if embeddingStatus === "error"}
                  <IconCircleX size={16} stroke={1.5} />
                {:else}
                  <IconStarFilled size={16} stroke={1.5} />
                {/if}
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>根据硬件自动推荐</Tooltip.Content>
        </Tooltip.Root>
        <!-- ╭─── / ModelCheckButton ───╮ -->
      </div>
    </div>

    <Separator class="bg-border/30" />

    <!-- ── Row: 本地文本模型 ── -->
    <div
      class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-8 p-6"
    >
      <div class="flex items-center gap-4 shrink-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconMessageChatbot
            size={20}
            stroke={1.5}
            class="text-muted-foreground"
          />
        </div>
        <div>
          <p class="text-sm font-medium text-foreground">本地文本模型</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            用于文本生成与对话的语言模型
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 w-full lg:w-96 shrink-0">
        <Input
          bind:value={textModel}
          onblur={handleTextBlur}
          placeholder="输入或选择文本模型…"
          class="min-w-0 flex-1 rounded-xl"
        />
        <Popover.Root bind:open={textDropdown}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="flex items-center justify-center size-9 rounded-xl border border-input bg-background transition-all duration-200 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
              >
                <IconChevronDown
                  size={16}
                  stroke={1.5}
                  class={cn(
                    "text-muted-foreground transition-transform duration-200",
                    embeddingDropdown && "rotate-180",
                  )}
                />
              </button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content
            align="end"
            sideOffset={6}
            class="rounded-xl p-1.5 w-80"
          >
            <div class="space-y-0.5">
              {#each TEXT_PRESETS as preset (preset.value)}
                <button
                  class={[
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all duration-200 hover:bg-accent",
                    textModel === preset.value && "bg-accent",
                  ]}
                  onclick={() => selectText(preset.value)}
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-foreground">
                      {preset.label}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {preset.note}
                    </p>
                  </div>
                  {#if textModel === preset.value}
                    <IconCheck
                      size={16}
                      stroke={1.5}
                      class="text-primary shrink-0"
                    />
                  {/if}
                </button>
              {/each}
            </div>
          </Popover.Content>
        </Popover.Root>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class={[
                  "flex items-center justify-center size-9 rounded-xl border bg-background transition-all duration-200 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0",
                  textStatus === "success" && "border-primary/50 text-primary",
                  textStatus === "error" &&
                    "border-destructive/50 text-destructive",
                  textStatus !== "success" &&
                    textStatus !== "error" &&
                    "border-input text-muted-foreground",
                  textStatus === "checking" && "pointer-events-none opacity-70",
                ]}
                disabled={textStatus === "checking"}
                onclick={() => handleCheckModel("text")}
              >
                {#if textStatus === "checking"}
                  <IconLoader2 size={16} stroke={1.5} class="animate-spin" />
                {:else if textStatus === "success"}
                  <IconCircleCheck size={16} stroke={1.5} />
                {:else if textStatus === "error"}
                  <IconCircleX size={16} stroke={1.5} />
                {:else}
                  <IconStarFilled size={16} stroke={1.5} />
                {/if}
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>根据硬件自动推荐</Tooltip.Content>
        </Tooltip.Root>
      </div>
    </div>
  </div>
</section>
