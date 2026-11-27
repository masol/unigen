<!-- packages/renderer/src/route/page/settings/mcp/MCPServerCard.svelte -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { BorderBeam } from "$lib/components/ui/border-beam";
  import { Button } from "$lib/components/ui/button";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import { safeApi } from "$lib/utils/api";
  import type {
    McpConnectionTestResult,
    McpServerConfig,
  } from "@app/main/types";
  import {
    IconAlertTriangle,
    IconBroadcast,
    IconCheck,
    IconChevronDown,
    IconCloudOff,
    IconCopy,
    IconDownload,
    IconLoader2,
    IconPencil,
    IconPlugConnected,
    IconTerminal2,
    IconTrash,
    IconWorld,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";
  import McpTestResult from "./McpTestResult.svelte";
  import { testMcpConnection } from "./mcpConnection";

  let {
    server,
    open = false,
    onOpenChange,
    onEdit,
    onRemove,
    onToggleEnabled,
  }: {
    server: McpServerConfig;
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    onEdit?: () => void;
    onRemove?: () => void;
    onToggleEnabled?: (enabled: boolean) => void;
  } = $props();

  const isDisabled = $derived(server.enabled === false);
  const isStdio = $derived(server.transport.type === "stdio");
  const isSse = $derived(server.transport.type === "sse");

  /** 名称可能为空串，退回服务标识兜底 */
  const displayName = $derived(server.name?.trim() || server.id);

  const transportLabel = $derived(isStdio ? "STDIO" : isSse ? "SSE" : "HTTP");

  const endpoint = $derived(
    server.transport.type === "stdio"
      ? [server.transport.command, ...(server.transport.args ?? [])].join(" ")
      : server.transport.url,
  );

  // 协议图标容器配色：以「形状 + 色调」编码传输协议，取代原先统一的占位图标。
  const iconBoxClass = $derived(
    isDisabled
      ? "bg-muted"
      : isStdio
        ? "bg-amber-500/10"
        : isSse
          ? "bg-sky-500/10"
          : "bg-primary/10",
  );

  const iconFgClass = $derived(
    isDisabled
      ? "text-muted-foreground/50"
      : isStdio
        ? "text-amber-600 dark:text-amber-400"
        : isSse
          ? "text-sky-600 dark:text-sky-400"
          : "text-primary",
  );

  // ── 服务标识复制 ──
  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  async function writeClipboard(text: string): Promise<boolean> {
    const clipboard = navigator.clipboard;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(text);
        return true;
      } catch {
        // 权限被拒 / 非安全上下文：走下面的兜底路径
      }
    }

    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.readOnly = true;
      el.style.position = "fixed";
      el.style.top = "0";
      el.style.left = "-9999px";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }

  async function handleCopyId() {
    const ok = await writeClipboard(server.id);

    if (!ok) {
      toast.error("复制失败，请手动选择服务标识");
      return;
    }

    copied = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 1600);
  }

  $effect(
    () => () => {
      if (copyTimer) clearTimeout(copyTimer);
    },
  );

  // ── 连接测试 ──
  let testState = $state<"idle" | "loading" | "success" | "error">("idle");
  let testResult = $state<McpConnectionTestResult | null>(null);
  let testError = $state("");
  let exporting = $state(false);
  let lastTransportFingerprint = JSON.stringify(server.transport);

  // 服务配置被编辑后，旧的测试结果不再代表当前连接参数。
  $effect(() => {
    const fingerprint = JSON.stringify(server.transport);
    if (fingerprint === lastTransportFingerprint) return;

    lastTransportFingerprint = fingerprint;
    testState = "idle";
    testResult = null;
    testError = "";
  });

  async function handleTest() {
    if (testState === "loading") return;

    testState = "loading";
    testError = "";
    testResult = null;

    try {
      const result = await testMcpConnection(server);
      testResult = result;

      if (result.ok) {
        testState = "success";
      } else {
        testState = "error";
        testError = result.error ?? "连接失败";
      }
    } catch (err) {
      testState = "error";
      testError = err instanceof Error ? err.message : "连接失败";
    }
  }

  async function handleExport() {
    if (exporting) return;

    exporting = true;

    try {
      const result = await safeApi().agent.exportMcpServerConfig({ server });

      if (result.canceled) return;

      if (result.success) {
        toast.success("已导出 MCP 配置");
      } else {
        toast.error("导出失败");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    } finally {
      exporting = false;
    }
  }
</script>

<Collapsible.Root {open} onOpenChange={(v) => onOpenChange?.(v)}>
  <div
    class={[
      "group relative isolate rounded-2xl ring-1 transition-all duration-200 contain-[layout_style]",
      isDisabled
        ? "ring-border/30 bg-card/60 shadow-none"
        : open
          ? "ring-border/50 bg-card shadow-md"
          : "ring-border/50 bg-card shadow-sm hover:shadow-lg",
    ]}
  >
    {#if isDisabled}
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

    <!--
      头部：
      - 触发器做成覆盖整个头部的「真空按钮」，让整行保持可点击展开；
      - 内容层 pointer-events-none，点击穿透到触发器；
        这样「复制服务标识」才能是一个合法的、独立的 button（不嵌套 button）。
    -->
    <div
      class={[
        "relative flex items-center gap-3 p-6 transition-colors duration-200",
        isStdio && "bg-amber-500/5 dark:bg-amber-400/5",
        isStdio && (open ? "rounded-t-2xl" : "rounded-2xl"),
      ]}
    >
      <Collapsible.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class="absolute inset-0 z-0 cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            aria-label={`${open ? "收起" : "展开"} ${displayName} 的详情`}
            title={displayName}
          ></button>
        {/snippet}
      </Collapsible.Trigger>

      <div
        class="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-4"
      >
        <!-- 协议图标：唯一的协议标识（形状 + 色调），不再是统一占位图标 -->
        <div
          role="img"
          aria-label={`传输协议 ${transportLabel}`}
          class={[
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200",
            iconBoxClass,
          ]}
        >
          {#if isStdio}
            <IconTerminal2 size={20} stroke={1.5} class={iconFgClass} />
          {:else if isSse}
            <IconBroadcast size={20} stroke={1.5} class={iconFgClass} />
          {:else}
            <IconWorld size={20} stroke={1.5} class={iconFgClass} />
          {/if}
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <span
              class={[
                "min-w-0 truncate text-lg font-medium transition-colors duration-200",
                isDisabled &&
                  "opacity-50 line-through decoration-muted-foreground/40 decoration-1",
              ]}
            >
              {displayName}
            </span>

            {#if isDisabled}
              <Badge
                variant="secondary"
                class="shrink-0 rounded-lg border-none bg-destructive/10 text-xs text-destructive"
              >
                <IconCloudOff size={12} stroke={1.5} class="mr-1" />
                已禁用
              </Badge>
            {/if}

            <!-- 服务标识：常驻可见但层级极低；hover/focus 才升起；点击即拷贝。
                 禁用态同样可拷贝（不进入 opacity 组）。 -->
            <button
              type="button"
              class={[
                "pointer-events-auto inline-flex max-w-40 shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] leading-none transition-colors duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                copied
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground/80 hover:bg-muted hover:text-foreground",
              ]}
              title="复制服务标识"
              aria-label={`复制服务标识 ${server.id}`}
              onclick={handleCopyId}
            >
              <span class="min-w-0 truncate">{server.id}</span>
              {#if copied}
                <IconCheck size={12} stroke={2} class="shrink-0" />
              {:else}
                <IconCopy size={12} stroke={1.5} class="shrink-0" />
              {/if}
            </button>
            <span class="sr-only" aria-live="polite">
              {copied ? `已复制 ${server.id}` : ""}
            </span>
          </div>

          <div
            class="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
          >
            <p
              class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
            >
              {endpoint}
            </p>

            {#if isStdio}
              <span
                class="flex shrink-0 items-center gap-1 text-xs text-amber-600 opacity-80 dark:text-amber-400"
              >
                <IconAlertTriangle size={12} stroke={1.5} />
                <span class="hidden sm:inline">stdio 将在本机启动进程</span>
                <span class="sm:hidden">本机进程</span>
              </span>
            {/if}
          </div>
        </div>

        <div
          class={[
            "shrink-0 transition-transform duration-200",
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

      <div class="relative z-10 flex shrink-0 items-center gap-3">
        <Switch
          checked={!isDisabled}
          onCheckedChange={(checked) => onToggleEnabled?.(checked)}
          class="scale-90"
        />
      </div>
    </div>

    <Collapsible.Content>
      <div class="space-y-6 px-6 pb-6">
        <Separator />

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="rounded-xl border border-border/50 bg-background p-4">
            <p class="text-xs text-muted-foreground">传输协议</p>
            <p class="mt-1 text-sm font-medium">{server.transport.type}</p>
          </div>

          <div
            class="rounded-xl border border-border/50 bg-background p-4 sm:col-span-2"
          >
            <p class="text-xs text-muted-foreground">连接参数</p>
            <p class="mt-1 break-all font-mono text-xs text-foreground">
              {endpoint}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              class="gap-2 rounded-xl text-xs"
              onclick={() => onEdit?.()}
            >
              <IconPencil size={14} stroke={1.5} />
              编辑
            </Button>

            <Button
              variant="outline"
              size="sm"
              class="gap-2 rounded-xl text-xs"
              onclick={handleTest}
              disabled={testState === "loading"}
            >
              {#if testState === "loading"}
                <IconLoader2 size={14} stroke={1.5} class="animate-spin" />
                测试中
              {:else}
                <IconPlugConnected size={14} stroke={1.5} />
                测试连接
              {/if}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              class="gap-2 rounded-xl text-xs text-muted-foreground hover:text-foreground"
              onclick={() => void handleExport()}
              disabled={exporting}
            >
              {#if exporting}
                <IconLoader2 size={14} stroke={1.5} class="animate-spin" />
                导出中
              {:else}
                <IconDownload size={14} stroke={1.5} />
                导出
              {/if}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            class="shrink-0 gap-1.5 rounded-xl text-xs text-muted-foreground/60 transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
            onclick={() => onRemove?.()}
          >
            <IconTrash size={14} stroke={1.5} />
            移除服务
          </Button>
        </div>

        {#if testState !== "idle"}
          <McpTestResult {testState} result={testResult} error={testError} />
        {/if}
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