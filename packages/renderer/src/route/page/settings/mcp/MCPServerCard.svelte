<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Separator } from "$lib/components/ui/separator";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Switch } from "$lib/components/ui/switch";
  import type {
    McpConnectionTestResult,
    McpServerConfig,
  } from "@app/main/types";
  import {
    IconAlertCircle,
    IconAlertTriangle,
    IconCheck,
    IconChevronDown,
    IconCloudOff,
    IconLoader2,
    IconPencil,
    IconPlugConnected,
    IconTrash,
  } from "@tabler/icons-svelte";
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

  const endpoint = $derived(
    server.transport.type === "stdio"
      ? [server.transport.command, ...(server.transport.args ?? [])].join(" ")
      : server.transport.url,
  );

  let testState = $state<"idle" | "loading" | "success" | "error">("idle");
  let testResult = $state<McpConnectionTestResult | null>(null);
  let testError = $state("");

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
</script>

<Collapsible.Root {open} onOpenChange={(v) => onOpenChange?.(v)}>
  <div
    class={[
      "rounded-2xl border transition-all duration-200",
      isDisabled
        ? "border-border/30 bg-card/60 shadow-none"
        : open
          ? "border-border/50 bg-card shadow-md"
          : "border-border/50 bg-card shadow-sm hover:shadow-lg",
    ]}
  >
    <div class="flex items-center gap-3 p-6">
      <Collapsible.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-4 text-left transition-colors duration-200 select-none"
          >
            <div
              class={[
                "flex size-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                isDisabled ? "bg-muted" : "bg-primary/10",
              ]}
            >
              <IconPlugConnected
                size={20}
                stroke={1.5}
                class={isDisabled ? "text-muted-foreground/50" : "text-primary"}
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
                  {server.name ?? server.id}
                </span>

                <Badge variant="secondary" class="rounded-lg text-xs">
                  {server.transport.type}
                </Badge>

                {#if isDisabled}
                  <Badge
                    variant="secondary"
                    class="rounded-lg border-none bg-destructive/10 text-xs text-destructive"
                  >
                    <IconCloudOff size={12} stroke={1.5} class="mr-1" />
                    已禁用
                  </Badge>
                {/if}
              </div>

              <p
                class="mt-0.5 truncate font-mono text-xs text-muted-foreground"
              >
                {endpoint}
              </p>
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
          </button>
        {/snippet}
      </Collapsible.Trigger>

      <div class="flex shrink-0 items-center gap-3">
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

        {#if isDisabled}
          <div
            class="flex items-center gap-4 rounded-xl border border-dashed border-destructive/20 bg-destructive/5 p-4"
          >
            <div
              class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10"
            >
              <IconCloudOff size={16} stroke={1.5} class="text-destructive" />
            </div>
            <p class="min-w-0 flex-1 text-sm text-muted-foreground">
              该 MCP 服务已被禁用，运行期不可用，配置仍然保留。
            </p>
          </div>
        {/if}

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

        {#if server.transport.type === "stdio"}
          <div
            class="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs text-muted-foreground"
          >
            <IconAlertTriangle
              size={16}
              stroke={1.5}
              class="mt-0.5 shrink-0 text-destructive"
            />
            <p>
              stdio 会在本机启动进程。请确认命令与参数来源可信；非必要建议使用
              HTTP / SSE。
            </p>
          </div>
        {/if}

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
          </div>

          <Button
            variant="ghost"
            size="sm"
            class="gap-2 rounded-xl text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            onclick={() => onRemove?.()}
          >
            <IconTrash size={14} stroke={1.5} />
            移除服务
          </Button>
        </div>

        {#if testState !== "idle"}
          <div class="rounded-xl border border-border/50 bg-background p-4">
            {#if testState === "loading"}
              <div class="space-y-3">
                <Skeleton class="h-4 w-40 rounded-lg" />
                <Skeleton class="h-3 w-64 rounded-lg" />
                <Skeleton class="h-10 w-full rounded-xl" />
              </div>
            {:else if testState === "success" && testResult}
              <div class="animate-fade-in space-y-4">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    class="rounded-lg border-none bg-primary/10 text-primary"
                  >
                    <IconCheck size={12} stroke={1.5} class="mr-1" />
                    连接成功
                  </Badge>
                  <span class="text-xs text-muted-foreground">
                    {testResult.latencyMs} ms
                  </span>
                  {#if testResult.protocolVersion}
                    <span class="text-xs text-muted-foreground">
                      协议 {testResult.protocolVersion}
                    </span>
                  {/if}
                  {#if testResult.serverInfo}
                    <span class="text-xs text-muted-foreground">
                      {testResult.serverInfo.name} v{testResult.serverInfo
                        .version}
                    </span>
                  {/if}
                </div>

                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted-foreground">
                    可用工具 · {testResult.tools.length}
                  </p>

                  {#if testResult.tools.length > 0}
                    <div class="space-y-2">
                      {#each testResult.tools as tool (tool.name)}
                        <div
                          class="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/20 p-3"
                        >
                          <IconPlugConnected
                            size={14}
                            stroke={1.5}
                            class="mt-0.5 shrink-0 text-muted-foreground"
                          />
                          <div class="min-w-0">
                            <p class="truncate font-mono text-xs font-medium">
                              {tool.name}
                            </p>
                            {#if tool.description}
                              <p class="text-xs text-muted-foreground">
                                {tool.description}
                              </p>
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="text-xs text-muted-foreground">
                      该服务未返回工具
                    </p>
                  {/if}
                </div>

                <p class="text-xs text-muted-foreground">
                  测试结果仅用于确认连接，不会写入配置。
                </p>
              </div>
            {:else}
              <div class="flex items-start gap-3 text-sm text-destructive">
                <IconAlertCircle
                  size={16}
                  stroke={1.5}
                  class="mt-0.5 shrink-0"
                />
                <p>{testError || "连接失败"}</p>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </Collapsible.Content>
  </div>
</Collapsible.Root>
