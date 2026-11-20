<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Switch } from "$lib/components/ui/switch";
  import { IconCloud, IconServer2 } from "@tabler/icons-svelte";
  import { environmentsStore } from "./store.svelte";
  import type { EnvironmentDetail, EnvironmentTransport } from "./types";

  type Props = { detail: EnvironmentDetail };
  let { detail }: Props = $props();

  let transport = $state<EnvironmentTransport>(detail.transport);
  let host = $state(detail.ssh?.host ?? "");
  let port = $state(String(detail.ssh?.port ?? 22));
  let user = $state(detail.ssh?.user ?? "");

  /**
   * 只在"环境自身身份"变化时同步本地表单。
   * 不订阅 detail 的引用变化，避免 autoSync / status / 组件状态等
   * 与本表单无关的更新把用户正在输入的内容覆盖掉。
   */
  let lastSyncedKey = "";
  $effect(() => {
    const key = [
      detail.id,
      detail.transport,
      detail.ssh?.host ?? "",
      detail.ssh?.user ?? "",
      detail.ssh?.port ?? 22,
    ].join("|");
    if (key === lastSyncedKey) return;
    lastSyncedKey = key;
    transport = detail.transport;
    host = detail.ssh?.host ?? "";
    port = String(detail.ssh?.port ?? 22);
    user = detail.ssh?.user ?? "";
  });

  async function save() {
    await environmentsStore.updateConnection(
      detail.id,
      transport,
      transport === "ssh"
        ? { host, user, port: Number(port) || 22 }
        : undefined,
    );
  }
</script>

<section class="space-y-3 rounded-2xl border border-border/50 bg-card p-5">
  <div class="flex items-center justify-between gap-2">
    <p class="text-sm font-semibold text-foreground">连接方式</p>
    <Button variant="outline" size="sm" class="rounded-lg" onclick={save}>
      保存
    </Button>
  </div>

  <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
    <label
      class="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors {transport ===
      'local'
        ? 'border-primary/50 bg-primary/5'
        : 'border-border/50 hover:bg-accent/40'}"
    >
      <input
        type="radio"
        name="transport"
        value="local"
        checked={transport === "local"}
        onchange={() => (transport = "local")}
        class="accent-primary"
      />
      <IconServer2 class="size-4 text-muted-foreground" />
      <div class="min-w-0">
        <p class="text-sm text-foreground">本机</p>
        <p class="truncate text-[11px] text-muted-foreground">在当前电脑运行</p>
      </div>
    </label>
    <label
      class="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors {transport ===
      'ssh'
        ? 'border-primary/50 bg-primary/5'
        : 'border-border/50 hover:bg-accent/40'}"
    >
      <input
        type="radio"
        name="transport"
        value="ssh"
        checked={transport === "ssh"}
        onchange={() => (transport = "ssh")}
        class="accent-primary"
      />
      <IconCloud class="size-4 text-muted-foreground" />
      <div class="min-w-0">
        <p class="text-sm text-foreground">SSH 远端</p>
        <p class="truncate text-[11px] text-muted-foreground">
          通过 SSH 连接到远端服务器
        </p>
      </div>
    </label>
  </div>

  {#if transport === "ssh"}
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <label class="space-y-1">
        <span class="text-[11px] text-muted-foreground">主机</span>
        <Input
          bind:value={host}
          placeholder="example.com"
          class="h-9 rounded-lg text-xs"
        />
      </label>
      <label class="space-y-1">
        <span class="text-[11px] text-muted-foreground">端口</span>
        <Input
          bind:value={port}
          placeholder="22"
          class="h-9 rounded-lg text-xs"
        />
      </label>
      <label class="space-y-1">
        <span class="text-[11px] text-muted-foreground">用户名</span>
        <Input
          bind:value={user}
          placeholder="root"
          class="h-9 rounded-lg text-xs"
        />
      </label>
    </div>
  {/if}

  <div
    class="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2.5"
  >
    <div class="space-y-0.5">
      <p class="text-xs font-medium text-foreground">自动同步配置</p>
      <p class="text-[11px] text-muted-foreground">
        修改参数后自动应用并重启服务。
      </p>
    </div>
    <Switch
      checked={detail.autoSync}
      onCheckedChange={(v) => environmentsStore.setAutoSync(detail.id, v)}
    />
  </div>
</section>
