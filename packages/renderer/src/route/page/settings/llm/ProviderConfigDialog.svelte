<script lang="ts">
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import {
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "$lib/components/ui/dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import { api } from "$lib/utils/api";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconAdjustments,
    IconAlertCircle,
    IconCheck,
    IconChevronDown,
    IconExternalLink,
    IconEye,
    IconEyeOff,
    IconKey,
    IconLoader2,
    IconPlus,
    IconRouter,
    IconServer,
    IconTrash,
    IconWorld,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";
  import { isURL } from "validator";
  import ProviderPresetCombobox from "./ProviderPresetCombobox.svelte";
  import { findPreset } from "./providers";
  import {
    allProtocols,
    protocolLabels,
    type ProviderConfig,
    type ProviderPreset,
    type ProviderProtocol,
  } from "./types";

  /* ─── Props ─── */
  type Props = {
    config?: Partial<ProviderConfig>;
    onSave?: (config: ProviderConfig) => Promise<void>;
  } & DialogComponentProps<ProviderConfig>;

  let { config, onSave, onClose, onCancel }: Props = $props();

  /* ─── 模式判定 ─── */
  // svelte-ignore state_referenced_locally
  const isEditMode = !!config?.id;
  const initialPreset = config?.id ? findPreset(config!.id) : null;

  /* ─── 表单状态 ─── */
  let selectedPresetId = $state<string | null>(initialPreset?.id ?? null);
  let isCustomMode = $state(isEditMode && !initialPreset);

  let providerId = $state(config?.id ?? "");
  let protocol = $state<ProviderProtocol | undefined>(
    config?.protocol ?? allProtocols.openai,
  );
  let baseUrl = $state(config?.baseUrl ?? "");
  let apiKey = $state(config?.apiKey ?? "");
  let maxConn = $state<number | undefined>(config?.maxConn ?? 1);
  let websiteUrl = $state(initialPreset?.website ?? "");
  let proxyUrl = $state(config?.proxyUrl ?? "");

  async function openExternal(url: string) {
    await api().system.openExternal({ url });
  }

  /* ─── 自定义请求头 ─── */
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

  /* ─── UI 状态 ─── */
  let keyVisible = $state(false);
  let isSubmitting = $state(false);
  let errorMessage = $state("");

  /* ─── 校验 ─── */
  const isValid = $derived(
    providerId.trim().length > 0 && baseUrl.trim().length > 0,
  );

  /* ─── 预设选择 ─── */
  function handlePresetSelect(preset: ProviderPreset | null) {
    if (preset) {
      selectedPresetId = preset.id;
      isCustomMode = false;
      providerId = preset.id;
      protocol = preset.protocol as ProviderProtocol;
      baseUrl = preset.baseUrl;
      websiteUrl = preset.website;
      maxConn = preset.maxconn;
    } else {
      selectedPresetId = null;
      isCustomMode = true;
    }
  }

  /* ─── 打开官网 ─── */
  function handleOpenWebsite() {
    if (websiteUrl) {
      console.log("websiteUrl=", websiteUrl);
      openExternal(websiteUrl);
    }
  }

  /* ─── 请求头增删 ─── */
  function addHeader() {
    headerEntries = [...headerEntries, createHeaderEntry()];
  }

  function removeHeader(uid: string) {
    headerEntries = headerEntries.filter((h) => h.uid !== uid);
  }

  /* ─── 提交 ─── */
  async function handleSubmit() {
    if (!isValid || isSubmitting) return;
    isSubmitting = true;
    errorMessage = "";

    try {
      const headers: Record<string, string> = {};
      for (const entry of headerEntries) {
        const k = entry.key.trim();
        if (k) headers[k] = entry.value;
      }

      let msg = "";
      if (baseUrl.trim().length === 0) {
        msg = "服务端点必须填写。";
      } else if (
        !isURL(baseUrl, {
          protocols: ["http", "https", "ws", "wss"],
        })
      ) {
        msg = "服务端点必须是有效的URL。";
      }
      if (msg) {
        toast.error(msg);
        const el = document.getElementById("dlg-base-url");
        el?.focus();
        return;
      }

      if (
        proxyUrl.trim().length > 0 &&
        !isURL(proxyUrl, {
          protocols: ["http", "https", "socks5", "socks4"],
        })
      ) {
        toast.error(
          `如果设置代理，必须是一个合法的URL(支持协议"http", "https", "socks5", "socks4")`,
        );
        const el = document.getElementById("dlg-proxy-url");
        el?.focus();
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
  <!-- ╭─────────────────────────────────────────────────────╮ -->
  <!-- │ 段落一 · 核心信息（预设 + 名称 + 密钥）             │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <div class="space-y-4">
    <!-- ╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [子组件 → ProviderPresetCombobox.svelte]             │ -->
    <!-- │ 职责：Command 面板搜索式预设选择器                    │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <ProviderPresetCombobox
      selectedId={selectedPresetId ?? ""}
      isCustom={isCustomMode}
      onSelect={handlePresetSelect}
    />
    <!-- ╭─── / ProviderPresetCombobox ───╮ -->

    <!-- 提供商名称 -->
    <div class="space-y-2">
      <Label for="dlg-provider-id">提供商名称</Label>
      <Input
        id="dlg-provider-id"
        bind:value={providerId}
        placeholder="输入名称标识此提供商…"
        class="rounded-xl"
      />
    </div>

    <!-- API 密钥 -->
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
            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-all duration-200 hover:text-foreground"
            onclick={() => {
              keyVisible = !keyVisible;
            }}
          >
            {#if keyVisible}
              <IconEyeOff class="size-4" />
            {:else}
              <IconEye class="size-4" />
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
  <!-- ╭─────────────────────────────────────────────────────╮ -->
  <!-- │ 段落二 · 连接配置                                    │ -->
  <!-- │ [可抽取子组件 → ConnectionConfigSection.svelte]       │ -->
  <!-- │ 职责：协议、端点、最大并发等连接参数                   │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <div class="space-y-4 rounded-2xl border border-border/50 p-6">
    <h3 class="flex items-center gap-2 text-base font-medium">
      <IconServer class="size-4 text-muted-foreground" />
      连接配置
    </h3>

    <!-- 服务端点 -->
    <div class="space-y-2">
      <Label for="dlg-base-url" class="flex items-center gap-2">
        <IconWorld class="size-4 text-muted-foreground" />
        服务端点
      </Label>
      <Input
        id="dlg-base-url"
        bind:value={baseUrl}
        placeholder="https://api.example.com/v1"
        class="rounded-xl"
      />
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <!-- 接口协议 -->
      <div class="space-y-2">
        <Label>接口协议</Label>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class="flex h-9 w-full items-center justify-between rounded-xl border border-input bg-background px-3 text-sm transition-all duration-200 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  class={protocol ? "text-foreground" : "text-muted-foreground"}
                >
                  {protocol ? protocolLabels[protocol] : "选择协议"}
                </span>
                <IconChevronDown
                  class="size-4 shrink-0 text-muted-foreground"
                />
              </button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            class="w-48 rounded-xl"
            align="start"
            style="z-index: 9999;"
          >
            {#each Object.values(allProtocols) as proto (proto)}
              <DropdownMenu.Item
                class="flex items-center justify-between rounded-lg"
                onclick={() => {
                  protocol = proto;
                }}
              >
                <span>{protocolLabels[proto]}</span>
                {#if protocol === proto}
                  <IconCheck class="size-4 text-primary" />
                {/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      <!-- 最大并发 -->
      <div class="space-y-2">
        <Label for="dlg-maxconn">最大并发</Label>
        <Input
          id="dlg-maxconn"
          type="number"
          value={maxConn != null ? String(maxConn) : ""}
          oninput={(e: Event) => {
            const raw = (e.currentTarget as HTMLInputElement).value;
            const num = raw ? parseInt(raw) : undefined;
            maxConn = num != null && !Number.isNaN(num) ? num : undefined;
          }}
          placeholder="不限制"
          class="rounded-xl"
          min="1"
        />
      </div>
    </div>

    <div
      class={[
        "flex items-center gap-2 transition-all duration-200",
        !proxyUrl ? "opacity-30 hover:opacity-75" : "opacity-100",
      ]}
    >
      <IconRouter class="size-5 shrink-0 text-muted-foreground" stroke={1.5} />
      <Input
        bind:value={proxyUrl}
        id="dlg-proxy-url"
        placeholder="代理地址（可选）"
        class="min-w-0 flex-1 rounded-xl border-dashed"
      />
    </div>
  </div>
  <!-- ╭─── / ConnectionConfigSection ───╮ -->

  <!-- ╭─────────────────────────────────────────────────────╮ -->
  <!-- │ 段落三 · 自定义请求头                                 │ -->
  <!-- │ [可抽取子组件 → HeaderEntriesSection.svelte]          │ -->
  <!-- │ 职责：可增删的 Key-Value 请求头列表                   │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <div class="space-y-4 rounded-2xl border border-border/50 p-6">
    <div class="flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-base font-medium">
        <IconAdjustments class="size-4 text-muted-foreground" />
        自定义请求头
      </h3>
      <Button
        variant="outline"
        size="sm"
        class="rounded-xl"
        onclick={addHeader}
      >
        <IconPlus class="size-4" />
        添加
      </Button>
    </div>

    <div use:autoAnimate>
      {#each headerEntries as entry (entry.uid)}
        <div class="flex items-center gap-2 pt-3 first:pt-0">
          <Input
            bind:value={entry.key}
            placeholder="Header 名称"
            class="min-w-0 flex-1 rounded-xl"
          />
          <Input
            bind:value={entry.value}
            placeholder="值"
            class="min-w-0 flex-1 rounded-xl"
          />
          <button
            type="button"
            class="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
            onclick={() => removeHeader(entry.uid)}
          >
            <IconTrash class="size-4" />
          </button>
        </div>
      {/each}

      {#if headerEntries.length === 0}
        <p class="py-3 text-center text-xs text-muted-foreground">
          暂无自定义请求头
        </p>
      {/if}
    </div>
  </div>
  <!-- ╭─── / HeaderEntriesSection ───╮ -->

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
