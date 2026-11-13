<!--
  MCP 服务配置对话框内容组件。

  使用方式（命令式）：
    await dialogStore.safeShow(MCPServerConfigDialog, {
      server,
      onSave: (cfg) => mcpStore.upsertServer(cfg),
    });

  分步流程（Stepper）：
    [0] 连接 —— 传输协议、URL/命令、鉴权、请求头
    [1] 测试 —— 从 Step 0 前进进入时自动测试；成功后方可继续
                从 Step 2 回退进入时保留历史测试结果，不自动重测
    [2] 确认 —— 名称（可修改）、服务 ID、启用开关（均为持久化字段）

  持久化字段（与 McpServerConfig 对齐）：
    id        —— 本地唯一标识
    name      —— 名称；优先取测试返回的 serverInfo.name，缺省回退为 "未命名"
    enabled   —— 是否启用
    transport —— 连接参数
-->
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
  import * as Stepper from "$lib/components/ui/stepper";
  import { Switch } from "$lib/components/ui/switch";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import type {
    McpConnectionTestResult,
    McpServerConfig,
    McpTransport,
  } from "@app/main/types";
  import {
    IconAlertCircle,
    IconAlertTriangle,
    IconChevronLeft,
    IconChevronRight,
    IconLoader2,
    IconRefresh,
  } from "@tabler/icons-svelte";
  import type { AuthMode } from "./McpAuthField.svelte";
  import McpAuthField, {
    buildAuthHeaders,
    parseAuthFromHeaders,
  } from "./McpAuthField.svelte";
  import type { HeaderPair } from "./McpHeaderEditor.svelte";
  import McpHeaderEditor, {
    pairsToRecord,
    recordToPairs,
  } from "./McpHeaderEditor.svelte";
  import McpTestResult from "./McpTestResult.svelte";
  import { testMcpConnection } from "./mcpConnection";

  type Props = {
    server?: Partial<McpServerConfig>;
    onSave?: (server: McpServerConfig) => Promise<void> | void;
  } & DialogComponentProps<McpServerConfig>;

  let { server, onSave, onClose, onCancel }: Props = $props();

  const isEditMode = !!server?.id;
  const initialTransport = server?.transport;

  // ── 步骤定义 ──
  const steps = [
    { step: 0, label: "连接" },
    { step: 1, label: "测试" },
    { step: 2, label: "确认" },
  ];

  let currentStep = $state(0);

  // ── 初始解析 ──
  const initialHeaders =
    initialTransport &&
    (initialTransport.type === "sse" || initialTransport.type === "http")
      ? initialTransport.headers
      : undefined;

  const parsed = parseAuthFromHeaders(initialHeaders);

  // ── 表单状态 ──
  let id = $state(server?.id ?? "");
  let name = $state(server?.name ?? "");
  let enabled = $state(server?.enabled ?? true);
  let transportType = $state<McpTransport["type"]>(
    initialTransport?.type ?? "http",
  );

  let command = $state(
    initialTransport?.type === "stdio" ? initialTransport.command : "",
  );
  let argsText = $state(
    initialTransport?.type === "stdio"
      ? (initialTransport.args ?? []).join(" ")
      : "",
  );
  let url = $state(
    initialTransport &&
      (initialTransport.type === "sse" || initialTransport.type === "http")
      ? initialTransport.url
      : "",
  );

  let authMode = $state<AuthMode>(parsed.authMode);
  let authToken = $state(parsed.authToken);
  let headerPairs = $state<HeaderPair[]>(
    recordToPairs(parsed.remaining, () => crypto.randomUUID()),
  );

  // ── 测试状态 ──
  let testing = $state(false);
  let testResult = $state<McpConnectionTestResult | null>(null);
  let testError = $state("");
  let testedSnapshot = $state("");
  let testToken = 0; // 普通变量：用于取消被 resetTest 作废的在途测试

  // ── 提交状态 ──
  let isSubmitting = $state(false);
  let errorMessage = $state("");

  // ── 工具函数 ──
  function parseArgs(): string[] {
    return argsText
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /** 浏览器内置 crc32（基于 TextEncoder，同步可用）。 */
  function crc32(text: string): number {
    const table: number[] = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }

    let crc = 0xffffffff;
    const bytes = new TextEncoder().encode(text);
    for (const b of bytes) {
      crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  /**
   * 从连接参数派生稳定、合法的函数/工具 ID。
   * seed 取服务器地址（http/sse 用 url；stdio 用命令与参数），
   * 结果固定为 "mcp" + 8 位十六进制（11 字符），严格匹配 ^[a-z][a-z0-9_-]{0,15}$。
   */
  function deriveId(): string {
    const seed =
      transportType === "stdio" ? `${command} ${argsText}`.trim() : url.trim();

    if (!seed) return "mcp-server";

    const hash = crc32(seed).toString(16).padStart(8, "0");
    return `mcp${hash}`;
  }

  function connectionSnapshot(): string {
    return JSON.stringify({
      transportType,
      url: url.trim(),
      command: command.trim(),
      argsText: argsText.trim(),
      authMode,
      authToken: authMode === "none" ? "" : authToken,
      headerPairs: headerPairs
        .filter((p) => p.key.trim())
        .map((p) => ({ k: p.key.trim(), v: p.value })),
    });
  }

  const connectionReady = $derived(
    transportType === "stdio"
      ? command.trim().length > 0
      : url.trim().length > 0,
  );

  const testPassed = $derived(
    testResult?.ok === true && testedSnapshot === connectionSnapshot(),
  );

  /** 供 McpTestResult 使用的统一状态枚举。 */
  let testDisplayState = $derived(
    testing
      ? ("loading" as const)
      : testResult?.ok
        ? ("success" as const)
        : testError
          ? ("error" as const)
          : ("idle" as const),
  );

  const isFinalValid = $derived(
    id.trim().length > 0 &&
      name.trim().length > 0 &&
      /^[a-z][a-z0-9_-]{0,15}$/.test(id.trim()),
  );

  function buildTransport(): McpTransport {
    if (transportType === "stdio") {
      return {
        type: "stdio",
        command: command.trim(),
        args: parseArgs(),
      };
    }

    const authHeaders = buildAuthHeaders(authMode, authToken);
    const custom = pairsToRecord(headerPairs);

    const headers: Record<string, string> = { ...custom };
    for (const [key, value] of Object.entries(authHeaders)) {
      headers[key] = value;
    }

    return {
      type: transportType,
      url: url.trim(),
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    };
  }

  function buildDraft(): McpServerConfig {
    return {
      id: id.trim() || "__pending__",
      name: name.trim() || undefined,
      enabled,
      transport: buildTransport(),
    };
  }

  // ── 测试 ──
  function resetTest() {
    testToken += 1;
    testing = false;
    testResult = null;
    testError = "";
    testedSnapshot = "";
  }

  async function runTest() {
    if (!connectionReady || testing) return;

    resetTest();
    const myToken = testToken;
    testing = true;

    try {
      const result = await testMcpConnection(buildDraft());
      if (myToken !== testToken) return; // 已被取消

      testResult = result;

      if (!result.ok) {
        testError = result.error ?? "连接失败";
        return;
      }

      // 记录本次测试的配置快照，配合 derived 的 testPassed 判定有效期
      testedSnapshot = connectionSnapshot();

      // 名称初值：优先取服务端返回；若用户已在别处填写则不覆盖
      if (!name.trim() && result.serverInfo?.name) {
        name = result.serverInfo.name;
      }
    } catch (err) {
      if (myToken !== testToken) return;
      testResult = null;
      testError = err instanceof Error ? err.message : "连接失败";
    } finally {
      if (myToken === testToken) testing = false;
    }
  }

  // ── 导航 ──
  function goForward() {
    if (currentStep === 0) {
      if (!connectionReady) return;
      resetTest();
      currentStep = 1;
      void runTest();
      return;
    }

    if (currentStep === 1) {
      if (!testPassed || testing) return;
      if (!id.trim()) id = deriveId();
      if (!name.trim()) {
        name = testResult?.serverInfo?.name?.trim() || "未命名";
      }
      currentStep = 2;
    }
  }

  function goBack() {
    if (currentStep === 0) return;
    // 只回退 step，不清测试状态：Step2 → Step1 显示历史结果，不重测
    currentStep -= 1;
  }

  // 兜底：若通过 Trigger 直接跳到 Step2 且测试未通过，退回 Step1
  $effect(() => {
    if (currentStep === 2 && !testPassed) {
      currentStep = 1;
    }
  });

  // ── 提交 ──
  async function handleSubmit() {
    if (!isFinalValid || isSubmitting) return;

    isSubmitting = true;
    errorMessage = "";

    try {
      const result: McpServerConfig = {
        id: id.trim(),
        name: name.trim(),
        enabled,
        transport: buildTransport(),
      };
      await onSave?.(result);
      onClose(result);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "保存失败";
    } finally {
      isSubmitting = false;
    }
  }
</script>

<DialogHeader>
  <DialogTitle>{isEditMode ? "编辑 MCP 服务" : "新建 MCP 服务"}</DialogTitle>
  <DialogDescription>
    {isEditMode ? "修改 MCP 服务连接参数" : "分步接入一个新的 MCP 服务"}
  </DialogDescription>
</DialogHeader>

<div class="space-y-5 py-4">
  <Stepper.Root bind:value={currentStep}>
    {#each steps as s (s.step)}
      <Stepper.Item step={s.step}>
        <Stepper.Trigger step={s.step}>
          <Stepper.Indicator step={s.step} />
          <Stepper.Title>{s.label}</Stepper.Title>
        </Stepper.Trigger>
        {#if s.step !== steps.length - 1}
          <Stepper.Separator />
        {/if}
      </Stepper.Item>
    {/each}
  </Stepper.Root>

  {#if currentStep === 0}
    <div class="animate-fade-in space-y-4">
      <div class="space-y-2">
        <Label>传输协议</Label>
        <div class="flex flex-wrap gap-2">
          {#each ["http", "sse", "stdio"] as t (t)}
            {@const active = transportType === t}
            <button
              type="button"
              onclick={() => (transportType = t as McpTransport["type"])}
              class={[
                "rounded-xl border px-3 py-1.5 text-sm transition-all duration-200",
                active
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/50 bg-background text-muted-foreground hover:bg-muted",
              ]}
            >
              {t === "stdio" ? "stdio（高级）" : t.toUpperCase()}
            </button>
          {/each}
        </div>
      </div>

      {#if transportType === "stdio"}
        <div
          class="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground"
        >
          <IconAlertTriangle
            size={16}
            stroke={1.5}
            class="mt-0.5 shrink-0 text-destructive"
          />
          <p>
            stdio 会在本机启动进程。请确认命令来源可信；非必要建议使用 HTTP /
            SSE。
          </p>
        </div>

        <div class="space-y-2">
          <Label for="mcp-cmd">启动命令</Label>
          <Input
            id="mcp-cmd"
            bind:value={command}
            placeholder="npx"
            class="rounded-xl font-mono"
          />
        </div>

        <div class="space-y-2">
          <Label for="mcp-args">参数（空格分隔）</Label>
          <Input
            id="mcp-args"
            bind:value={argsText}
            placeholder="-y @modelcontextprotocol/server-github"
            class="rounded-xl font-mono"
          />
        </div>
      {:else}
        <div class="space-y-2">
          <Label for="mcp-url">端点 URL</Label>
          <Input
            id="mcp-url"
            bind:value={url}
            placeholder="https://mcp.example.com/xxx"
            class="rounded-xl"
          />
        </div>

        <McpAuthField bind:authMode bind:authToken />
        <McpHeaderEditor bind:headerPairs />
      {/if}
    </div>
  {:else if currentStep === 1}
    <div class="animate-fade-in space-y-4">
      <McpTestResult
        testState={testDisplayState}
        result={testResult}
        error={testError}
        stale={testResult?.ok === true && !testPassed}
      />

      {#if !testing && testDisplayState !== "idle"}
        <Button
          type="button"
          variant="outline"
          class="gap-2 rounded-xl"
          onclick={() => void runTest()}
          disabled={!connectionReady}
        >
          <IconRefresh size={16} stroke={1.5} />
          重新测试
        </Button>
      {/if}
    </div>
  {:else}
    <div class="animate-fade-in space-y-4">
      <div class="space-y-2">
        <Label for="mcp-name">名称</Label>
        <Input
          id="mcp-name"
          bind:value={name}
          placeholder="MCP 服务"
          class="rounded-xl"
        />
        {#if testResult?.serverInfo?.name}
          <p class="text-xs text-muted-foreground">
            已从服务器信息自动填充，可直接修改
          </p>
        {/if}
      </div>

      <div class="space-y-2">
        <Label for="mcp-id">服务 ID</Label>
        <Input
          id="mcp-id"
          bind:value={id}
          placeholder="mcp0a1b2c3d"
          class="rounded-xl font-mono"
        />
        <p class="text-xs text-muted-foreground">
          本地唯一标识，须匹配
          <code class="rounded bg-muted px-1 py-0.5 font-mono"
            >^[a-z][a-z0-9_-]&#123;0,15&#125;$</code
          >
        </p>
      </div>

      <div
        class="flex items-center justify-between rounded-xl border border-border/50 bg-background p-3"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">启用服务</p>
          <p class="text-xs text-muted-foreground">
            禁用后保留配置，但不参与运行
          </p>
        </div>

        <Switch
          checked={enabled}
          onCheckedChange={(checked) => (enabled = checked)}
        />
      </div>
    </div>
  {/if}

  {#if errorMessage}
    <Alert.Root variant="destructive" class="rounded-xl">
      <IconAlertCircle class="size-4" />
      <Alert.Title>保存失败</Alert.Title>
      <Alert.Description>{errorMessage}</Alert.Description>
    </Alert.Root>
  {/if}
</div>

<DialogFooter class="mt-4">
  {#if currentStep > 0}
    <Button
      variant="outline"
      onclick={goBack}
      disabled={isSubmitting || testing}
    >
      <IconChevronLeft size={16} stroke={1.5} />
      上一步
    </Button>
  {:else}
    <Button
      variant="outline"
      onclick={() => onCancel()}
      disabled={isSubmitting}
    >
      取消
    </Button>
  {/if}

  {#if currentStep === 0}
    <Button onclick={goForward} disabled={!connectionReady}>
      下一步
      <IconChevronRight size={16} stroke={1.5} />
    </Button>
  {:else if currentStep === 1}
    <Button onclick={goForward} disabled={!testPassed || testing}>
      下一步
      <IconChevronRight size={16} stroke={1.5} />
    </Button>
  {:else}
    <Button onclick={handleSubmit} disabled={!isFinalValid || isSubmitting}>
      {#if isSubmitting}
        <IconLoader2 class="size-4 animate-spin" />
        保存中
      {:else}
        {isEditMode ? "保存更改" : "创建"}
      {/if}
    </Button>
  {/if}
</DialogFooter>
