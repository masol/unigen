<!-- ProviderCard.svelte -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { BorderBeam } from "$lib/components/ui/border-beam";
  import { Button } from "$lib/components/ui/button";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconChevronDown,
    IconCloudOff,
    IconDatabase,
    IconKey,
    IconPlus,
    IconSearch,
    IconServer,
    IconSettings,
    IconTrash,
  } from "@tabler/icons-svelte";

  import { type Model, getProviderIcon } from "$lib/utils/model/types";
  import type { Provider } from "@app/main/types";
  import { cn } from "tailwind-variants";
  import ModelCard from "./ModelCard.svelte";
  import { searchStore } from "./searchstore.svelte";

  let {
    provider,
    visibleModels,
    open = false,
    onOpenChange,
    onEditConfig,
    onAddModel,
    onRemoveModel,
    onRemoveProvider,
    onToggleEnabled,
  }: {
    provider: Provider;
    visibleModels: Model[];
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    onEditConfig?: () => void;
    onAddModel?: (model?: Model) => void;
    onRemoveModel?: (modelId: string) => void;
    onRemoveProvider?: () => void;
    onToggleEnabled?: (enabled: boolean) => void;
  } = $props();

  let ProviderIcon = $derived(getProviderIcon(provider));
  let isDisabled = $derived(provider.disabled === true);

  function handleToggleEnabled(checked: boolean) {
    provider.disabled = !checked;
    onToggleEnabled?.(checked);
  }
</script>

<Collapsible.Root {open} onOpenChange={(v) => onOpenChange?.(v)}>
  <div
    class={[
      "group relative isolate rounded-2xl ring-1 transition-all duration-200 contain-[layout_style]",
      // 默认态：中性淡边框，仅用于分辨卡片；彩色强调只在 hover 由 beam/pulse 提供
      isDisabled
        ? "ring-border/30 bg-muted/50 shadow-none"
        : open
          ? "ring-border/50 bg-card shadow-md"
          : "ring-border/50 bg-card shadow-sm hover:shadow-lg",
    ]}
  >
    {#if isDisabled}
      <!-- 禁用态：hover 才显示，destructive 色调、更慢节奏 -->
      <BorderBeam
        size={2}
        duration={12}
        color="var(--destructive)"
        class="z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
      <span class="beam-pulse beam-pulse--disabled z-10" aria-hidden="true"
      ></span>
    {:else}
      <BorderBeam
        size={2}
        duration={6}
        class="z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
      <span class="beam-pulse z-10" aria-hidden="true"></span>
    {/if}

    <!-- ─── Trigger ─── -->
    <Collapsible.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          class={[
            "flex w-full cursor-pointer items-center gap-4 p-6 text-left transition-colors duration-200 select-none",
            open ? "rounded-t-2xl" : "rounded-2xl",
            isDisabled ? "hover:bg-muted/15" : "hover:bg-muted/30",
          ]}
        >
          <div
            class={[
              "flex size-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
              isDisabled ? "bg-muted" : "bg-primary/10",
            ]}
          >
            <ProviderIcon
              size={20}
              stroke={1.5}
              class={cn(
                "transition-colors duration-200",
                isDisabled ? "text-muted-foreground/50" : "text-primary",
              )}
            />
          </div>

          <div
            class={[
              "min-w-0 flex-1 transition-opacity duration-200",
              isDisabled && "opacity-50",
            ]}
          >
            <div class="flex flex-wrap items-center gap-2">
              <span
                class={[
                  "text-lg font-medium transition-all duration-200",
                  isDisabled &&
                    "line-through decoration-muted-foreground/40 decoration-1",
                ]}
              >
                {provider.id}
              </span>
              {#if isDisabled}
                <Badge
                  variant="secondary"
                  class="rounded-lg border-none bg-destructive/10 text-xs text-destructive"
                >
                  <IconCloudOff size={12} stroke={1.5} class="mr-1" />
                  已禁用
                </Badge>
              {/if}
              {#if provider.protocol}
                <Badge
                  variant="secondary"
                  class={["rounded-lg text-xs", isDisabled && "opacity-60"]}
                >
                  {provider.protocol}
                </Badge>
              {/if}
              {#if provider.apiKey && !isDisabled}
                <div
                  class="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"
                >
                  <IconKey size={12} stroke={1.5} />
                  <span>已配置</span>
                </div>
              {/if}
            </div>
            <p
              class="mt-0.5 max-w-xs truncate text-xs text-muted-foreground sm:max-w-sm lg:max-w-md"
              title={provider.baseUrl}
            >
              {provider.baseUrl}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-3">
            <Switch
              checked={!isDisabled}
              onCheckedChange={handleToggleEnabled}
              onclick={(e: MouseEvent) => e.stopPropagation()}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === " " || e.key === "Enter") e.stopPropagation();
              }}
              class="scale-90"
              title={isDisabled ? "点击启用该提供商" : "点击禁用该提供商"}
            />

            <Badge
              variant="outline"
              class={[
                "rounded-lg text-xs transition-opacity duration-200",
                isDisabled && "opacity-40",
              ]}
            >
              {#if searchStore.isFiltering && visibleModels.length !== provider.models.length}
                {visibleModels.length}/{provider.models.length} 个模型
              {:else}
                {provider.models.length} 个模型
              {/if}
            </Badge>
            <div
              class={[
                "transition-transform duration-200",
                open && "rotate-180",
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

        <div class="flex flex-wrap items-center justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            class="gap-2 rounded-xl text-xs"
            onclick={() => onEditConfig?.()}
            disabled={isDisabled}
          >
            <IconSettings size={14} stroke={1.5} />
            编辑提供商
          </Button>

          {#if provider.maxConn}
            <div
              class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
            >
              <span class="flex items-center gap-1">
                <IconServer size={12} stroke={1.5} />
                最大并发 {provider.maxConn}
              </span>
            </div>
          {/if}
        </div>

        <Separator />

        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3
              class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              模型列表
              {#if searchStore.isFiltering && visibleModels.length !== provider.models.length}
                <span class="ml-1 font-normal">
                  ({visibleModels.length}/{provider.models.length})
                </span>
              {:else}
                <span class="ml-1 font-normal">
                  ({provider.models.length})
                </span>
              {/if}
            </h3>
            {#if !isDisabled}
              <Button
                variant="outline"
                size="sm"
                class="gap-1.5 rounded-xl text-xs"
                onclick={() => onAddModel?.()}
              >
                <IconPlus size={14} stroke={1.5} />
                添加模型
              </Button>
            {/if}
          </div>

          {#if visibleModels.length > 0}
            <div
              class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
              use:autoAnimate
            >
              {#each visibleModels as model (model.id)}
                <ModelCard
                  {model}
                  disabled={isDisabled}
                  onEdit={() => onAddModel?.(model)}
                  onRemove={() => onRemoveModel?.(model.id)}
                />
              {/each}
            </div>
          {:else if searchStore.isFiltering}
            <div
              class="flex flex-col items-center justify-center space-y-3 rounded-xl border border-dashed border-border/50 py-8"
            >
              <IconSearch
                size={18}
                stroke={1.5}
                class="text-muted-foreground"
              />
              <p class="text-sm text-muted-foreground">该提供商下无匹配模型</p>
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
              <p class="text-sm text-muted-foreground">该提供商尚无模型</p>
            </div>
          {/if}
        </div>

        <Separator />
        <div class="flex items-center justify-between">
          <p class="text-xs text-muted-foreground">
            移除后该提供商及其所有模型配置将被永久删除
          </p>
          <Button
            variant="ghost"
            size="sm"
            class="shrink-0 gap-1.5 rounded-xl text-xs text-muted-foreground/60 transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
            onclick={() => onRemoveProvider?.()}
          >
            <IconTrash size={14} stroke={1.5} />
            移除提供商
          </Button>
        </div>
      </div>
    </Collapsible.Content>
  </div>
</Collapsible.Root>

<style>
  /* 启用态：hover 触发，primary 色调，节奏 2.4s */
  .beam-pulse {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
    transition: opacity 200ms ease;
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 55%, transparent);
  }

  :global(.group:hover) .beam-pulse:not(.beam-pulse--disabled) {
    opacity: 1;
    animation: beam-border-pulse 2.4s ease-in-out infinite;
  }

  @keyframes beam-border-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 25%, transparent);
    }
    50% {
      box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 85%, transparent);
    }
  }

  /* 禁用态：同样 hover 才显示；destructive 色调 + 更慢的 3.6s 节奏 */
  :global(.group:hover) .beam-pulse--disabled {
    opacity: 1;
    animation: beam-border-pulse--disabled 3.6s ease-in-out infinite;
  }

  @keyframes beam-border-pulse--disabled {
    0%,
    100% {
      box-shadow: 0 0 0 1px
        color-mix(in oklch, var(--destructive) 25%, transparent);
    }
    50% {
      box-shadow: 0 0 0 1px
        color-mix(in oklch, var(--destructive) 70%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.group:hover) .beam-pulse:not(.beam-pulse--disabled) {
      animation: none;
      opacity: 1;
      box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 55%, transparent);
    }
    :global(.group:hover) .beam-pulse--disabled {
      animation: none;
      opacity: 1;
      box-shadow: 0 0 0 1px
        color-mix(in oklch, var(--destructive) 55%, transparent);
    }
  }
</style>
