<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import autoAnimate from "@formkit/auto-animate";
  import { dialogStore } from "$lib/store/dialog.svelte";
  import { IconSearch, IconFilterOff } from "@tabler/icons-svelte";

  import { type Model, type Provider } from "@app/main/types";
  import { searchStore } from "./searchstore.svelte";
  import SearchFilterBar from "./SearchFilterBar.svelte";
  import ConfigHeader from "./ConfigHeader.svelte";
  import ProviderCard from "./ProviderCard.svelte";
  import EmptyProvidersState from "./EmptyProvidersState.svelte";
  import ProviderConfigDialog from "./ProviderConfigDialog.svelte";
  import type { ProviderConfig } from "./types";
  import { configStore } from "$lib/store/config.svelte";
  import ModelConfigDialog from "./model/ModelConfigDialog.svelte";

  /* ═══════════════════════════════════════════════════════════
     ConfirmState — 命令式 Promise 驱动的确认对话框状态
     ═══════════════════════════════════════════════════════════ */

  class ConfirmState {
    open = $state(false);
    title = $state("");
    message = $state("");
    confirmLabel = $state("确认");
    destructive = $state(false);
    private _resolve: ((confirmed: boolean) => void) | null = null;

    /**
     * 发起一次确认请求，返回 Promise<boolean>。
     * 调用方 await 即可拿到结果，确认 = true，取消/关闭 = false。
     */
    request(opts: {
      title: string;
      message: string;
      confirmLabel?: string;
      destructive?: boolean;
    }): Promise<boolean> {
      // 如果上一次请求尚未被用户处理，隐式取消它
      if (this._resolve) {
        this._resolve(false);
        this._resolve = null;
      }

      this.title = opts.title;
      this.message = opts.message;
      this.confirmLabel = opts.confirmLabel ?? "确认";
      this.destructive = opts.destructive ?? false;
      this.open = true;

      return new Promise<boolean>((resolve) => {
        this._resolve = resolve;
      });
    }

    /** 用户点击确认按钮 */
    confirm() {
      this._resolve?.(true);
      this._resolve = null;
      this.open = false;
    }

    /** 用户点击取消按钮 */
    cancel() {
      this._resolve?.(false);
      this._resolve = null;
      this.open = false;
    }

    /**
     * AlertDialog.Root 的 onOpenChange 回调。
     * 处理用户通过 Esc / 点击遮罩关闭对话框的场景：
     * 若此时 _resolve 仍存在，说明既没有点确认也没有点取消，视为取消。
     */
    handleOpenChange(value: boolean) {
      if (!value && this._resolve) {
        this._resolve(false);
        this._resolve = null;
      }
      this.open = value;
    }
  }

  const confirmState = new ConfirmState();

  /* ═══════════════════════════════════════════════════════════
     UI State
     ═══════════════════════════════════════════════════════════ */

  let openStates = $state<Record<string, boolean>>({});

  let totalModels = $derived(configStore.totalModels);
  let providerCount = $derived(configStore.providers.length);
  let hasProviders = $derived(configStore.providers.length > 0);

  /* ═══════════════════════════════════════════════════════════
     Actions — Provider CRUD（含确认对话框）
     ═══════════════════════════════════════════════════════════ */

  async function addProvider(provider?: Partial<ProviderConfig>) {
    await dialogStore.safeShow(ProviderConfigDialog, {
      config: provider,
      onSave: async (config: ProviderConfig): Promise<void> => {
        configStore.upsertProvider({ ...config, models: [] });
      },
    });
  }

  async function handleRemoveModel(providerId: string, modelId: string) {
    const provider = configStore.providers.find((p) => p.id === providerId);
    const model = provider?.models.find((m) => m.id === modelId);
    const displayName = model?.id ?? modelId;

    const confirmed = await confirmState.request({
      title: "移除模型",
      message: `确定要移除「${displayName}」吗？此操作不可撤销。`,
      confirmLabel: "确认移除",
      destructive: true,
    });

    if (!confirmed) return;

    await configStore.removeModel(providerId, modelId);
  }

  async function handleRemoveProvider(providerId: string) {
    const provider = configStore.providers.find((p) => p.id === providerId);
    const count = provider?.models.length ?? 0;
    const displayName = provider?.id ?? providerId;

    const confirmed = await confirmState.request({
      title: "移除提供商",
      message: `确定要移除「${displayName}」及其 ${count} 个模型吗？此操作不可撤销。`,
      confirmLabel: "确认移除",
      destructive: true,
    });

    if (!confirmed) return;

    await configStore.removeProvider(providerId);
  }

  async function upsertModel(pid: string, model?: Model): Promise<void> {
    const provider = configStore.findProviderById(pid);
    if (!provider) {
      throw new Error(`请求增加的模型，其所属供应商${pid}无效。`);
    }
    await dialogStore.safeShow(ModelConfigDialog, {
      model,
      fetchCtx: { baseUrl: provider.baseUrl, apiKey: provider.apiKey },
      onSave: async (model: Model): Promise<void> => {
        console.log("save model",model)
        await configStore.upsertModel(pid, model);
      },
    });
    console.log(model);
  }

  /* ═══════════════════════════════════════════════════════════
     Search & Filter
     ═══════════════════════════════════════════════════════════ */

  function getVisibleModels(provider: Provider): Model[] {
    const q = searchStore.searchQuery.toLowerCase().trim();
    const hasAbilityFilter = searchStore.activeAbilityFilters.length > 0;
    if (!q && !hasAbilityFilter) return provider.models;

    const providerNameMatch = !q || provider.id.toLowerCase().includes(q);

    return provider.models.filter((m) => {
      const modelTextMatch =
        !q || providerNameMatch || m.id.toLowerCase().includes(q);
      const abilityMatch =
        !hasAbilityFilter ||
        m.abilities.some((a) => searchStore.activeAbilityFilters.includes(a));
      return modelTextMatch && abilityMatch;
    });
  }

  let filteredProviders = $derived.by(() => {
    const q = searchStore.searchQuery.toLowerCase().trim();
    const hasAbilityFilter = searchStore.activeAbilityFilters.length > 0;
    if (!q && !hasAbilityFilter) return configStore.providers;

    return configStore.providers.filter((p) => {
      const providerTextMatch =
        !q ||
        p.id.toLowerCase().includes(q) ||
        p.baseUrl.toLowerCase().includes(q);

      const hasMatchingModel = p.models.some((m) => {
        const modelTextMatch =
          !q || providerTextMatch || m.id.toLowerCase().includes(q);
        const abilityMatch =
          !hasAbilityFilter ||
          m.abilities.some((a) => searchStore.activeAbilityFilters.includes(a));
        return modelTextMatch && abilityMatch;
      });

      if (!hasAbilityFilter) return providerTextMatch || hasMatchingModel;
      return hasMatchingModel;
    });
  });

  let filteredModelCount = $derived(
    filteredProviders.reduce((s, p) => s + getVisibleModels(p).length, 0),
  );
</script>

<!-- ════════════════════════════════════════════════════════════
     Template
     ════════════════════════════════════════════════════════════ -->
<div class="flex h-full w-full flex-col overflow-y-auto bg-background">
  <div class="space-y-8 p-8 lg:p-12">
    <ConfigHeader
      {providerCount}
      {totalModels}
      onAddProvider={() => addProvider(undefined)}
    />

    {#if hasProviders}
      <SearchFilterBar
        filteredProviderCount={filteredProviders.length}
        {filteredModelCount}
      />
      <Separator />
    {/if}

    <!-- ═══ Provider List ═══ -->
    <div class="space-y-6" use:autoAnimate>
      {#each filteredProviders as provider (provider.id)}
        <ProviderCard
          {provider}
          visibleModels={getVisibleModels(provider)}
          open={openStates[provider.id] ?? false}
          onOpenChange={(v) => {
            openStates[provider.id] = v;
          }}
          onEditConfig={() => addProvider(provider)}
          onAddModel={async (model?: Model) => {
            await upsertModel(provider.id, model);
          }}
          onRemoveModel={(modelId) => handleRemoveModel(provider.id, modelId)}
          onRemoveProvider={() => handleRemoveProvider(provider.id)}
        />
      {/each}

      <!-- No Results (filtering active) -->
      {#if searchStore.isFiltering && filteredProviders.length === 0}
        <div
          class="flex animate-fade-in flex-col items-center justify-center space-y-6 py-20"
        >
          <div
            class="flex size-14 items-center justify-center rounded-2xl bg-muted"
          >
            <IconSearch size={22} stroke={1.5} class="text-muted-foreground" />
          </div>
          <div class="space-y-2 text-center">
            <h3 class="text-lg font-medium">未找到匹配结果</h3>
            <p class="text-sm text-muted-foreground">
              尝试更换搜索关键词或调整筛选条件
            </p>
          </div>
          <Button
            variant="outline"
            class="gap-2 rounded-xl"
            onclick={() => searchStore.clearAllFilters()}
          >
            <IconFilterOff size={16} stroke={1.5} />
            清除全部筛选
          </Button>
        </div>
      {/if}

      <!-- Global Empty State -->
      {#if !searchStore.isFiltering && configStore.providers.length === 0}
        <EmptyProvidersState onAddProvider={addProvider} />
      {/if}
    </div>
  </div>
</div>

<!-- ════════════════════════════════════════════════════════════
     Confirm AlertDialog — 全局唯一，由 confirmState 驱动
     ════════════════════════════════════════════════════════════ -->
<AlertDialog.Root
  open={confirmState.open}
  onOpenChange={(v) => confirmState.handleOpenChange(v)}
>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{confirmState.title}</AlertDialog.Title>
      <AlertDialog.Description>{confirmState.message}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel
        class="rounded-xl"
        onclick={() => confirmState.cancel()}
      >
        取消
      </AlertDialog.Cancel>
      <AlertDialog.Action
        class={[
          "rounded-xl",
          confirmState.destructive &&
            "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        ]}
        onclick={() => confirmState.confirm()}
      >
        {confirmState.confirmLabel}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
