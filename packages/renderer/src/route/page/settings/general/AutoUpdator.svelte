<script lang="ts">
  import {
    IconInfoCircle,
    IconRefresh,
    IconCloudDownload,
  } from "@tabler/icons-svelte";
  import { Button } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import { Separator } from "$lib/components/ui/separator";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { configStore } from "$lib/store/config.svelte";
  import { api } from "$lib/utils/api";
  import { onMount } from "svelte";

  // ═══════════════════════════════════════════════════════════
  // State — Update
  // ═══════════════════════════════════════════════════════════
  const autoUpdateProxy = {
    get value() {
      return configStore.autoupdate;
    },
    set value(newValue: boolean) {
      configStore.setAutoupdate(newValue);
    },
  };

  let appVersion = $state<string | null>(null);

  onMount(async () => {
    appVersion = await api().system.version();
  });
  // ═══════════════════════════════════════════════════════════
  // Constants & Presets
  // ═══════════════════════════════════════════════════════════
</script>

<section class="space-y-4">
  <h2 class="text-lg font-medium text-foreground px-1">更新</h2>
  <div
    class="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-border"
  >
    <!-- Row: 版本号 & 检查更新 -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconInfoCircle
            size={20}
            stroke={1.5}
            class="text-muted-foreground"
          />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2.5">
            <p class="text-sm font-medium text-foreground">当前版本</p>
            {#if appVersion === null}
              <Skeleton class="h-5 w-20 rounded-lg" />
            {:else}
              <Badge
                variant="secondary"
                class="rounded-lg font-mono text-xs animate-fade-in"
              >
                {appVersion}
              </Badge>
            {/if}
          </div>
          <p class="text-xs text-muted-foreground mt-0.5">
            检查是否有新版本可用
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        class="rounded-xl gap-2 shrink-0 transition-all duration-200"
        disabled
      >
        <IconRefresh size={16} stroke={1.5} />
        检查更新
      </Button>
    </div>

    <Separator class="bg-border/30" />

    <!-- Row: 自动更新 -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconCloudDownload
            size={20}
            stroke={1.5}
            class="text-muted-foreground"
          />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">自动更新</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            新版本可用时自动下载并安装
          </p>
        </div>
      </div>
      <Switch bind:checked={autoUpdateProxy.value} class="shrink-0" />
    </div>
  </div>
</section>
