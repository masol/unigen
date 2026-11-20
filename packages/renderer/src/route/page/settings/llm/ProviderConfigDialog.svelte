<!-- ProviderConfigDialog.svelte -->
<script lang="ts">
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import {
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import { api } from "$lib/utils/api";
  import {
    allProtocols,
    type ProviderConfig,
    type ProviderProtocol,
  } from "$lib/utils/model/types";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconAlertCircle,
    IconExternalLink,
    IconEye,
    IconEyeOff,
    IconKey,
    IconLoader2,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";
  import { isURL } from "validator";
  import type { ComboboxItem } from "./combobox/combobox.types";
  import ComboboxSearch from "./combobox/ComboboxSearch.svelte";
  import ConnectionSection from "./ConnectionSection.svelte";
  import HeaderEntriesSection from "./HeaderEntriesSection.svelte";
  import {
    KNOWN_PROVIDERS,
    findPreset,
    findPresetByBaseUrl,
    searchPresets,
  } from "./providers";

  type Props = {
    config?: Partial<ProviderConfig>;
    existingProviderIds?: string[];
    onSave?: (config: ProviderConfig) => Promise<void>;
  } & DialogComponentProps<ProviderConfig>;

  let {
    config,
    existingProviderIds = [],
    onSave,
    onClose,
    onCancel,
  }: Props = $props();

  const isEditMode = !!config?.id;

  // ── 单一输入源：名称即搜索词；选预设时应用其连接配置 ──
  let providerId = $state(config?.id ?? "");
  let protocol = $state<ProviderProtocol | undefined>(
    config?.protocol ?? allProtocols.openai,
  );
  let baseUrl = $state(config?.baseUrl ?? "");
  let apiKey = $state(config?.apiKey ?? "");
  let maxConn = $state<number | undefined>(config?.maxConn ?? 1);
  let proxyUrl = $state(config?.proxyUrl ?? "");

  // 官网链接以 baseUrl（稳定锚点）为唯一来源派生
  const websiteUrl = $derived(findPresetByBaseUrl(baseUrl)?.website ?? "");

  async function openExternal(url: string) {
    await api().system.openExternal({ url });
  }

  interface HeaderEntry {
    uid: string;
    key: string;
    value: string;
  }
  let headerCounter = 0;
  function createHeaderEntry(key = "", value = ""): HeaderEntry {
    return { uid: `h-${++headerCounter}`, key, value };
  }
  let headerEntries = $state<HeaderEntry[]>(
    config?.headers
      ? Object.entries(config.headers).map(([k, v]) => createHeaderEntry(k, v))
      : [],
  );

  let keyVisible = $state(false);
  let isSubmitting = $state(false);
  let errorMessage = $state("");

  // ── 预设下拉：query 由 ComboboxSearch.onQueryChange 回填 ──
  let query = $state("");

  const presetItems = $derived.by<ComboboxItem[]>(() => {
    const q = query.trim();
    if (!q) {
      return KNOWN_PROVIDERS.flatMap((g) =>
        g.presets.map((p) => ({
          id: p.id,
          label: p.label,
          description: p.note,
          group: g.heading,
        })),
      );
    }
    return searchPresets(q).map((p) => ({
      id: p.id,
      label: p.label,
      description: p.note,
      group: "搜索结果",
    }));
  });

  /** 当前 providerId / baseUrl 对应的预设 id（供列表选中标记） */
  const matchedPresetId = $derived.by(() => {
    const byId = findPreset(providerId.trim());
    if (byId) return byId.id;
    return findPresetByBaseUrl(baseUrl)?.id ?? "";
  });

  /**
   * 用户点击 / 回车选中某个预设项。
   * providerId 由 ComboboxSearch 的 bind:value 自动写入；这里只应用连接配置。
   */
  function handlePresetSelect(item: ComboboxItem) {
    const preset = findPreset(item.id);
    if (!preset) return;
    protocol = preset.protocol as ProviderProtocol;
    baseUrl = preset.baseUrl;
    maxConn = preset.maxconn;
    if (preset.apiKey) apiKey = preset.apiKey;
  }

  /** 目前 providerId 是否与其他 Provider 冲突（编辑模式下调用方已剔除自己） */
  const duplicateIdError = $derived.by(() => {
    const trimmed = providerId.trim();
    if (!trimmed) return "";
    if (existingProviderIds.includes(trimmed)) {
      return `已存在同名提供商「${trimmed}」，请换一个名称。`;
    }
    return "";
  });

  const isValid = $derived(
    providerId.trim().length > 0 &&
      baseUrl.trim().length > 0 &&
      duplicateIdError === "",
  );

  function handleOpenWebsite() {
    if (websiteUrl) openExternal(websiteUrl);
  }

  async function handleSubmit() {
    if (!isValid || isSubmitting) return;

    if (duplicateIdError) {
      toast.error(duplicateIdError);
      document.getElementById("dlg-provider-id")?.focus();
      return;
    }

    isSubmitting = true;
    errorMessage = "";
    try {
      const headers: Record<string, string> = {};
      for (const entry of headerEntries) {
        const k = entry.key.trim();
        if (k) headers[k] = entry.value;
      }
      let msg = "";
      if (baseUrl.trim().length === 0) msg = "服务端点必须填写。";
      else if (!isURL(baseUrl, { protocols: ["http", "https", "ws", "wss"] }))
        msg = "服务端点必须是有效的URL。";
      if (msg) {
        toast.error(msg);
        document.getElementById("dlg-base-url")?.focus();
        return;
      }
      if (
        proxyUrl.trim().length > 0 &&
        !isURL(proxyUrl, { protocols: ["http", "https", "socks5", "socks4"] })
      ) {
        toast.error(
          `如果设置代理，必须是一个合法的URL(支持协议"http", "https", "socks5", "socks4")`,
        );
        document.getElementById("dlg-proxy-url")?.focus();
        return;
      }
      const result: ProviderConfig = {
        id: providerId.trim(),
        protocol,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        proxyUrl: proxyUrl.trim() || undefined,
        maxConn,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      };
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
  <DialogTitle>{isEditMode ? "编辑提供商" : "新建提供商"}</DialogTitle>
  <DialogDescription>
    {isEditMode
      ? "修改提供商的连接参数与请求配置"
      : "配置新的 AI 模型提供商连接"}
  </DialogDescription>
</DialogHeader>

<div class="space-y-6 py-4" use:autoAnimate>
  <div class="space-y-4">
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ 单一输入源：名称 = 预设搜索词                          │ -->
    <!-- │ 空输入 → 全量预设；输入即拼音过滤；                 │ -->
    <!-- │ 不点预设直接 Enter/对勾 → 采用自定义名称。            │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <div class="space-y-2">
      <Label for="dlg-provider-id">提供商名称</Label>
      <ComboboxSearch
        bind:value={providerId}
        items={presetItems}
        selectedValue={matchedPresetId}
        placeholder="输入或搜索提供商名称…"
        emptyText="未找到匹配的预设，回车或点对勾可直接使用当前输入"
        shouldFilter={false}
        onQueryChange={(q) => (query = q)}
        onSelect={handlePresetSelect}
      />
      <!-- 错误区预留空间：防止对话框高度抖动 -->
      <div class="min-h-5">
        {#if duplicateIdError}
          <p
            id="dlg-provider-id-err"
            class="animate-fade-in text-xs text-destructive"
          >
            {duplicateIdError}
          </p>
        {/if}
      </div>
    </div>

    <div class="space-y-2">
      <Label class="flex items-center gap-2">
        <IconKey class="size-4 text-muted-foreground" />
        API 密钥
      </Label>
      <div class="flex items-center gap-2">
        {#if websiteUrl}
          <Tooltip.Provider delayDuration={200}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <button
                    {...props}
                    type="button"
                    aria-label="打开官网"
                    class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/5 text-primary transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/10 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onclick={handleOpenWebsite}
                  >
                    <IconExternalLink class="size-4" />
                  </button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content class="z-300"
                >前往官网申请 API 密钥</Tooltip.Content
              >
            </Tooltip.Root>
          </Tooltip.Provider>
        {/if}
        <div class="relative min-w-0 flex-1">
          <Input
            id="dlg-api-key"
            type={keyVisible ? "text" : "password"}
            bind:value={apiKey}
            placeholder="sk-…（本地服务可留空）"
            class="rounded-xl pr-9"
          />
          <button
            type="button"
            aria-label="切换密钥可见"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-all duration-200 hover:text-foreground"
            onclick={() => (keyVisible = !keyVisible)}
          >
            {#if keyVisible}<IconEyeOff class="size-4" />{:else}<IconEye
                class="size-4"
              />{/if}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [子组件 → ConnectionSection.svelte]                  │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <ConnectionSection bind:protocol bind:baseUrl bind:maxConn bind:proxyUrl />

  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [子组件 → HeaderEntriesSection.svelte]               │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <HeaderEntriesSection bind:entries={headerEntries} />

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
