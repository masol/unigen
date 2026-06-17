<script lang="ts">
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";
  import autoAnimate from "@formkit/auto-animate";
  import { dialogStore } from "$lib/store/dialog.svelte";
  import ConfirmDialog from "$lib/components/dialog/Confirm.svelte";
  import {
    IconPlus,
    IconTrash,
    IconChevronDown,
    IconCloud,
    IconDeviceDesktop,
    IconKey,
    IconBrain,
    IconEye,
    IconMicrophone,
    IconCode,
    IconMessage,
    IconArrowsSort,
    IconDatabase,
    IconBolt,
    IconServer,
    IconShieldLock,
  } from "@tabler/icons-svelte";

  /* ═══════════════════════════════════════════════════════════
     Types — 使用 const object + type 替代 enum（Svelte 不原生支持 enum）
     ═══════════════════════════════════════════════════════════ */

  const ModelAbility = {
    TextGeneration: "text-generation",
    CodeGeneration: "code-generation",
    Reasoning: "reasoning",
    Embedding: "embedding",
    Rerank: "rerank",
    Vision: "vision",
    Audio: "audio",
  } as const;
  type ModelAbility = (typeof ModelAbility)[keyof typeof ModelAbility];

  const ProviderProtocol = {
    OpenAI: "openai",
    Ollama: "ollama",
    Anthropic: "anthropic",
    GoogleVertex: "google-vertex",
    HuggingFace: "huggingface",
  } as const;
  type ProviderProtocol =
    (typeof ProviderProtocol)[keyof typeof ProviderProtocol];

  type Modality = "text" | "image" | "audio" | "video";
  type PricingType = "free" | "per-token" | "per-request" | "local";

  interface Model {
    id: string;
    name?: string;
    abilities: ModelAbility[];
    inputModalities: Modality[];
    outputModalities: Modality[];
    inctx: number;
    outctx: number;
    pricingType: PricingType;
    incost_1m?: number;
    outcost_1m?: number;
    isLocal: boolean;
  }

  interface Provider {
    id: string;
    name?: string;
    protocol?: ProviderProtocol;
    baseUrl: string;
    apiKey?: string;
    rateLimits?: { rpc?: number; tpm?: number; maxConn?: number };
    proxyUrl?: string;
    headers?: Record<string, string>;
    models: Model[];
  }

  /* ═══════════════════════════════════════════════════════════
     Helpers
     ═══════════════════════════════════════════════════════════ */

  function formatTokens(n: number): string {
    if (n >= 1_000_000) {
      const v = n / 1_000_000;
      return `${v % 1 === 0 ? v : v.toFixed(1)}M`;
    }
    if (n >= 1_000) {
      const v = n / 1_000;
      return `${v % 1 === 0 ? v : v.toFixed(1)}K`;
    }
    return String(n);
  }

  const abilityLabels: Record<ModelAbility, string> = {
    [ModelAbility.TextGeneration]: "文本",
    [ModelAbility.CodeGeneration]: "代码",
    [ModelAbility.Reasoning]: "推理",
    [ModelAbility.Embedding]: "嵌入",
    [ModelAbility.Rerank]: "重排",
    [ModelAbility.Vision]: "视觉",
    [ModelAbility.Audio]: "音频",
  };

  const abilityIcons: Record<ModelAbility, typeof IconMessage> = {
    [ModelAbility.TextGeneration]: IconMessage,
    [ModelAbility.CodeGeneration]: IconCode,
    [ModelAbility.Reasoning]: IconBrain,
    [ModelAbility.Embedding]: IconDatabase,
    [ModelAbility.Rerank]: IconArrowsSort,
    [ModelAbility.Vision]: IconEye,
    [ModelAbility.Audio]: IconMicrophone,
  };

  const protocolLabels: Record<ProviderProtocol, string> = {
    [ProviderProtocol.OpenAI]: "OpenAI",
    [ProviderProtocol.Ollama]: "Ollama",
    [ProviderProtocol.Anthropic]: "Anthropic",
    [ProviderProtocol.GoogleVertex]: "Vertex AI",
    [ProviderProtocol.HuggingFace]: "HuggingFace",
  };

  const modalityLabels: Record<Modality, string> = {
    text: "文本",
    image: "图片",
    audio: "音频",
    video: "视频",
  };

  /* ═══════════════════════════════════════════════════════════
     Mock Data — 精细仿真数据，保证独立渲染完整
     ═══════════════════════════════════════════════════════════ */

  const mockProviders: Provider[] = [
    {
      id: "openai",
      name: "OpenAI",
      protocol: ProviderProtocol.OpenAI,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-proj-xxxxxxxx",
      rateLimits: { rpc: 500, tpm: 200_000, maxConn: 25 },
      models: [
        {
          id: "gpt-4o",
          name: "GPT-4o",
          abilities: [
            ModelAbility.TextGeneration,
            ModelAbility.CodeGeneration,
            ModelAbility.Vision,
          ],
          inputModalities: ["text", "image"],
          outputModalities: ["text"],
          inctx: 128_000,
          outctx: 16_384,
          pricingType: "per-token",
          incost_1m: 2.5,
          outcost_1m: 10,
          isLocal: false,
        },
        {
          id: "gpt-4o-mini",
          name: "GPT-4o Mini",
          abilities: [
            ModelAbility.TextGeneration,
            ModelAbility.CodeGeneration,
            ModelAbility.Vision,
          ],
          inputModalities: ["text", "image"],
          outputModalities: ["text"],
          inctx: 128_000,
          outctx: 16_384,
          pricingType: "per-token",
          incost_1m: 0.15,
          outcost_1m: 0.6,
          isLocal: false,
        },
        {
          id: "o3",
          name: "o3",
          abilities: [
            ModelAbility.Reasoning,
            ModelAbility.TextGeneration,
            ModelAbility.CodeGeneration,
            ModelAbility.Vision,
          ],
          inputModalities: ["text", "image"],
          outputModalities: ["text"],
          inctx: 200_000,
          outctx: 100_000,
          pricingType: "per-token",
          incost_1m: 10,
          outcost_1m: 40,
          isLocal: false,
        },
        {
          id: "text-embedding-3-large",
          name: "Embedding 3 Large",
          abilities: [ModelAbility.Embedding],
          inputModalities: ["text"],
          outputModalities: ["text"],
          inctx: 8_191,
          outctx: 0,
          pricingType: "per-token",
          incost_1m: 0.13,
          outcost_1m: 0,
          isLocal: false,
        },
      ],
    },
    {
      id: "anthropic",
      name: "Anthropic",
      protocol: ProviderProtocol.Anthropic,
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "sk-ant-xxxxxxxx",
      rateLimits: { rpc: 1000, tpm: 400_000 },
      models: [
        {
          id: "claude-sonnet-4-20250514",
          name: "Claude Sonnet 4",
          abilities: [
            ModelAbility.TextGeneration,
            ModelAbility.CodeGeneration,
            ModelAbility.Vision,
            ModelAbility.Reasoning,
          ],
          inputModalities: ["text", "image"],
          outputModalities: ["text"],
          inctx: 200_000,
          outctx: 64_000,
          pricingType: "per-token",
          incost_1m: 3,
          outcost_1m: 15,
          isLocal: false,
        },
        {
          id: "claude-3-5-haiku-20241022",
          name: "Claude 3.5 Haiku",
          abilities: [ModelAbility.TextGeneration, ModelAbility.CodeGeneration],
          inputModalities: ["text"],
          outputModalities: ["text"],
          inctx: 200_000,
          outctx: 8_192,
          pricingType: "per-token",
          incost_1m: 0.8,
          outcost_1m: 4,
          isLocal: false,
        },
      ],
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      protocol: ProviderProtocol.OpenAI,
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "sk-xxxxxxxx",
      rateLimits: { rpc: 60, tpm: 100_000 },
      models: [
        {
          id: "deepseek-chat",
          name: "DeepSeek-V3",
          abilities: [ModelAbility.TextGeneration, ModelAbility.CodeGeneration],
          inputModalities: ["text"],
          outputModalities: ["text"],
          inctx: 64_000,
          outctx: 8_192,
          pricingType: "per-token",
          incost_1m: 0.27,
          outcost_1m: 1.1,
          isLocal: false,
        },
        {
          id: "deepseek-reasoner",
          name: "DeepSeek-R1",
          abilities: [ModelAbility.TextGeneration, ModelAbility.Reasoning],
          inputModalities: ["text"],
          outputModalities: ["text"],
          inctx: 64_000,
          outctx: 8_192,
          pricingType: "per-token",
          incost_1m: 0.55,
          outcost_1m: 2.19,
          isLocal: false,
        },
      ],
    },
    {
      id: "local-ollama",
      name: "本地 Ollama",
      protocol: ProviderProtocol.Ollama,
      baseUrl: "http://localhost:11434",
      models: [
        {
          id: "llama3.1:8b",
          name: "Llama 3.1 8B",
          abilities: [ModelAbility.TextGeneration, ModelAbility.CodeGeneration],
          inputModalities: ["text"],
          outputModalities: ["text"],
          inctx: 131_072,
          outctx: 8_192,
          pricingType: "local",
          isLocal: true,
        },
        {
          id: "qwen2.5:7b",
          name: "Qwen 2.5 7B",
          abilities: [ModelAbility.TextGeneration, ModelAbility.CodeGeneration],
          inputModalities: ["text"],
          outputModalities: ["text"],
          inctx: 131_072,
          outctx: 8_192,
          pricingType: "local",
          isLocal: true,
        },
        {
          id: "nomic-embed-text",
          name: "Nomic Embed Text",
          abilities: [ModelAbility.Embedding],
          inputModalities: ["text"],
          outputModalities: ["text"],
          inctx: 8_192,
          outctx: 0,
          pricingType: "local",
          isLocal: true,
        },
      ],
    },
  ];

  /* ═══════════════════════════════════════════════════════════
     Store — 生产环境替换为：
     import { configStore } from '$lib/stores/config.svelte';
     ═══════════════════════════════════════════════════════════ */

  class ConfigStore {
    providers = $state<Provider[]>(mockProviders);

    get totalModels(): number {
      return this.providers.reduce((s, p) => s + p.models.length, 0);
    }

    get localModelCount(): number {
      return this.providers.reduce(
        (s, p) => s + p.models.filter((m) => m.isLocal).length,
        0,
      );
    }

    async removeModel(providerId: string, modelId: string, modelName?: string) {
      const confirmed = await dialogStore.safeShow(ConfirmDialog, {
        title: "移除模型",
        message: `确定要移除「${modelName ?? modelId}」吗？此操作不可撤销。`,
      });
      if (confirmed !== true) return;
      const provider = this.providers.find((p) => p.id === providerId);
      if (provider) {
        provider.models = provider.models.filter((m) => m.id !== modelId);
      }
    }

    async removeProvider(providerId: string) {
      const provider = this.providers.find((p) => p.id === providerId);
      const count = provider?.models.length ?? 0;
      const confirmed = await dialogStore.safeShow(ConfirmDialog, {
        title: "移除提供商",
        message: `确定要移除「${provider?.name ?? providerId}」及其 ${count} 个模型吗？此操作不可撤销。`,
      });
      if (confirmed !== true) return;
      this.providers = this.providers.filter((p) => p.id !== providerId);
    }

    async addProvider() {
      // TODO: await dialogStore.safeShow(AddProviderDialog, {});
    }

    async addModel(providerId: string) {
      void providerId;
      // TODO: await dialogStore.safeShow(AddModelDialog, { providerId });
    }
  }

  const configStore = new ConfigStore();

  /* ═══════════════════════════════════════════════════════════
     UI State
     ═══════════════════════════════════════════════════════════ */

  let openStates = $state<Record<string, boolean>>({});
  let totalModels = $derived(configStore.totalModels);
  let localModels = $derived(configStore.localModelCount);
  let providerCount = $derived(configStore.providers.length);
</script>

<!-- ════════════════════════════════════════════════════════════
     Template
     ════════════════════════════════════════════════════════════ -->
<div class="w-full h-full overflow-y-auto bg-background">
  <div class="space-y-8 p-8 lg:p-12">
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → ConfigHeader.svelte]                │ -->
    <!-- │ 职责：顶部标题栏，含全局统计摘要与添加提供商按钮      │ -->
    <!--╰─────────────────────────────────────────────────────╯ -->
    <header
      class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">
          模型配置
        </h1>
        <p class="text-sm text-muted-foreground">
          管理 AI 服务提供商及其支持的模型
        </p>
        <div class="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
          <span class="flex items-center gap-1.5">
            <IconServer size={14} stroke={1.5} />
            {providerCount} 个提供商
          </span>
          <span class="text-border">·</span>
          <span class="flex items-center gap-1.5">
            <IconBrain size={14} stroke={1.5} />
            {totalModels} 个模型
          </span>
          {#if localModels > 0}
            <span class="text-border">·</span>
            <span class="flex items-center gap-1.5">
              <IconDeviceDesktop size={14} stroke={1.5} />
              {localModels} 个本地
            </span>
          {/if}
        </div>
      </div>

      <Button
        class="gap-2 self-start rounded-xl sm:self-auto"
        onclick={() => configStore.addProvider()}
      >
        <IconPlus size={16} stroke={1.5} />
        添加提供商
      </Button>
    </header>
    <!-- ╭─── / ConfigHeader ───╮ -->

    <Separator />

    <!-- ═══ Provider List ═══ -->
    <div class="space-y-6" use:autoAnimate>
      {#each configStore.providers as provider (provider.id)}
        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → ProviderCard.svelte]                │ -->
        <!-- │ 职责：单个提供商可折叠面板，含元信息、速率限制与      │ -->
        <!-- │       内部模型网格，以及添加模型/移除提供商操作        │ -->
        <!--╰─────────────────────────────────────────────────────╯ -->
        <Collapsible.Root
          open={openStates[provider.id] ?? false}
          onOpenChange={(v) => {
            openStates[provider.id] = v;
          }}
        >
          <div
            class={[
              "rounded-2xl border border-border/50 bg-card transition-all duration-200",
              openStates[provider.id]
                ? "shadow-md"
                : "shadow-sm hover:shadow-lg",
            ]}
          >
            <!-- ─── Trigger ─── -->
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  class={[
                    "flex w-full cursor-pointer items-center gap-4 p-6 text-left transition-colors duration-200 select-none hover:bg-muted/30",
                    openStates[provider.id] ? "rounded-t-2xl" : "rounded-2xl",
                  ]}
                >
                  <!-- Provider Icon -->
                  <div
                    class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"
                  >
                    {#if provider.models.some((m) => m.isLocal)}
                      <IconDeviceDesktop
                        size={20}
                        stroke={1.5}
                        class="text-primary"
                      />
                    {:else}
                      <IconCloud size={20} stroke={1.5} class="text-primary" />
                    {/if}
                  </div>

                  <!-- Provider Info -->
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-lg font-medium">
                        {provider.name ?? provider.id}
                      </span>
                      {#if provider.protocol}
                        <Badge variant="secondary" class="rounded-lg text-xs">
                          {protocolLabels[provider.protocol]}
                        </Badge>
                      {/if}
                    </div>
                    <p
                      class="mt-0.5 max-w-xs truncate text-xs text-muted-foreground sm:max-w-sm lg:max-w-md"
                      title={provider.baseUrl}
                    >
                      {provider.baseUrl}
                    </p>
                  </div>

                  <!-- Meta -->
                  <div class="flex shrink-0 items-center gap-3">
                    {#if provider.apiKey}
                      <div
                        class="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"
                      >
                        <IconKey size={14} stroke={1.5} />
                        <span>已配置</span>
                      </div>
                    {/if}
                    <Badge variant="outline" class="rounded-lg text-xs">
                      {provider.models.length} 个模型
                    </Badge>
                    <div
                      class={[
                        "transition-transform duration-200",
                        openStates[provider.id] && "rotate-180",
                      ]}
                    >
                      <IconChevronDown
                        size={20}
                        stroke={1.5}
                        class="text-muted-foreground"
                      />
                    </div>
                  </div>
                </button>
              {/snippet}
            </Collapsible.Trigger>

            <!-- ─── Content ─── -->
            <Collapsible.Content>
              <div class="space-y-6 px-6 pb-6">
                <Separator />

                <!-- Rate Limits -->
                {#if provider.rateLimits || provider.proxyUrl}
                  <div
                    class="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"
                  >
                    {#if provider.rateLimits?.rpc}
                      <span class="flex items-center gap-1.5">
                        <IconBolt size={14} stroke={1.5} />
                        {provider.rateLimits.rpc} RPM
                      </span>
                    {/if}
                    {#if provider.rateLimits?.tpm}
                      <span class="flex items-center gap-1.5">
                        <IconMessage size={14} stroke={1.5} />
                        {formatTokens(provider.rateLimits.tpm)} TPM
                      </span>
                    {/if}
                    {#if provider.rateLimits?.maxConn}
                      <span class="flex items-center gap-1.5">
                        <IconServer size={14} stroke={1.5} />
                        最大并发 {provider.rateLimits.maxConn}
                      </span>
                    {/if}
                    {#if provider.proxyUrl}
                      <span class="flex items-center gap-1.5">
                        <IconShieldLock size={14} stroke={1.5} />
                        代理 {provider.proxyUrl}
                      </span>
                    {/if}
                  </div>
                {/if}

                <!-- Models Grid / Empty -->
                {#if provider.models.length > 0}
                  <div
                    class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                    use:autoAnimate
                  >
                    {#each provider.models as model (model.id)}
                      <!--╭─────────────────────────────────────────────────────╮ -->
                      <!-- │ [可抽取子组件 → ModelCard.svelte]                   │ -->
                      <!-- │ 职责：单个模型信息卡片，展示能力标签、上下文窗口、    │ -->
                      <!-- │       定价信息、多模态指示与删除操作                  │ -->
                      <!--╰─────────────────────────────────────────────────────╯ -->
                      <div
                        class="group relative space-y-3 rounded-xl border border-border/50 bg-background p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                      >
                        <!-- Header -->
                        <div class="flex items-start justify-between gap-2">
                          <div class="min-w-0">
                            <p class="truncate text-sm font-medium">
                              {model.name ?? model.id}
                            </p>
                            <p
                              class="mt-0.5 truncate font-mono text-xs text-muted-foreground"
                            >
                              {model.id}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            class="size-7 shrink-0 rounded-lg text-muted-foreground opacity-0 transition-all duration-200 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                            onclick={(e: MouseEvent) => {
                              e.stopPropagation();
                              configStore.removeModel(
                                provider.id,
                                model.id,
                                model.name,
                              );
                            }}
                          >
                            <IconTrash size={14} stroke={1.5} />
                          </Button>
                        </div>

                        <!-- Abilities -->
                        <div class="flex flex-wrap gap-1.5">
                          {#each model.abilities as ability (ability)}
                            {@const AbilityIcon = abilityIcons[ability]}
                            <Badge
                              variant="secondary"
                              class="gap-1 rounded-lg px-2 py-0.5 text-xs"
                            >
                              <AbilityIcon size={12} stroke={1.5} />
                              {abilityLabels[ability]}
                            </Badge>
                          {/each}
                        </div>

                        <!-- Context Windows -->
                        <div
                          class="flex items-center gap-3 text-xs text-muted-foreground"
                        >
                          <span title="输入上下文窗口">
                            ↓ {formatTokens(model.inctx)}
                          </span>
                          {#if model.outctx > 0}
                            <span title="最大输出">
                              ↑ {formatTokens(model.outctx)}
                            </span>
                          {/if}
                        </div>

                        <!-- Pricing + Modality -->
                        <div class="flex items-center justify-between text-xs">
                          <div>
                            {#if model.pricingType === "per-token" && model.incost_1m !== undefined}
                              <span class="text-muted-foreground">
                                <span class="font-medium text-primary">
                                  ${model.incost_1m}
                                </span>
                                <span class="mx-0.5 text-border">/</span>
                                <span class="font-medium text-primary">
                                  ${model.outcost_1m}
                                </span>
                                <span class="ml-1">per 1M</span>
                              </span>
                            {:else if model.pricingType === "local"}
                              <Badge
                                variant="outline"
                                class="gap-1 rounded-lg text-xs"
                              >
                                <IconDeviceDesktop size={12} stroke={1.5} />
                                本地运行
                              </Badge>
                            {:else if model.pricingType === "free"}
                              <Badge
                                variant="outline"
                                class="rounded-lg text-xs"
                              >
                                免费
                              </Badge>
                            {:else}
                              <Badge
                                variant="outline"
                                class="rounded-lg text-xs"
                              >
                                按次计费
                              </Badge>
                            {/if}
                          </div>

                          {#if model.inputModalities.some((m) => m !== "text")}
                            <div
                              class="flex items-center gap-1.5 text-muted-foreground"
                            >
                              {#each model.inputModalities.filter((m) => m !== "text") as mod (mod)}
                                <span title={`输入: ${modalityLabels[mod]}`}>
                                  {#if mod === "image"}
                                    <IconEye size={14} stroke={1.5} />
                                  {:else if mod === "audio"}
                                    <IconMicrophone size={14} stroke={1.5} />
                                  {/if}
                                </span>
                              {/each}
                            </div>
                          {/if}
                        </div>
                      </div>
                      <!-- ╭─── / ModelCard ───╮ -->
                    {/each}
                  </div>
                {:else}
                  <div
                    class="flex flex-col items-center justify-center space-y-3 rounded-xl border border-dashed border-border/50 py-10"
                  >
                    <div
                      class="flex size-10 items-center justify-center rounded-xl bg-muted"
                    >
                      <IconDatabase
                        size={18}
                        stroke={1.5}
                        class="text-muted-foreground"
                      />
                    </div>
                    <p class="text-sm text-muted-foreground">
                      该提供商尚无模型
                    </p>
                  </div>
                {/if}

                <!-- Provider Actions -->
                <div class="flex items-center gap-3">
                  <Button
                    variant="outline"
                    class="gap-2 rounded-xl"
                    onclick={() => configStore.addModel(provider.id)}
                  >
                    <IconPlus size={16} stroke={1.5} />
                    添加模型
                  </Button>
                  <div class="flex-1"></div>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="gap-2 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onclick={() => configStore.removeProvider(provider.id)}
                  >
                    <IconTrash size={14} stroke={1.5} />
                    移除提供商
                  </Button>
                </div>
              </div>
            </Collapsible.Content>
          </div>
        </Collapsible.Root>
        <!-- ╭─── / ProviderCard ───╮ -->
      {/each}

      <!-- Global Empty State -->
      {#if configStore.providers.length === 0}
        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → EmptyProvidersState.svelte]         │ -->
        <!-- │ 职责：无提供商时的全局空状态引导，含添加 CTA          │ -->
        <!--╰─────────────────────────────────────────────────────╯ -->
        <div
          class="flex flex-col items-center justify-center space-y-6 py-24 animate-fade-in"
        >
          <div
            class="flex size-16 items-center justify-center rounded-2xl bg-muted"
          >
            <IconServer size={24} stroke={1.5} class="text-muted-foreground" />
          </div>
          <div class="space-y-2 text-center">
            <h3 class="text-lg font-medium">尚未配置提供商</h3>
            <p class="text-sm text-muted-foreground">
              添加 AI 服务提供商以开始使用模型能力
            </p>
          </div>
          <Button
            class="gap-2 rounded-xl"
            onclick={() => configStore.addProvider()}
          >
            <IconPlus size={16} stroke={1.5} />
            添加提供商
          </Button>
        </div>
        <!-- ╭─── / EmptyProvidersState ───╮ -->
      {/if}
    </div>
  </div>
</div>
