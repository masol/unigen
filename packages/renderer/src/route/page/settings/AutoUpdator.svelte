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
  import { configStore } from "$lib/store/config.svelte";

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
  // ═══════════════════════════════════════════════════════════
  // Constants & Presets
  // ═══════════════════════════════════════════════════════════
  const APP_VERSION = "v0.0.3";
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
            <Badge variant="secondary" class="rounded-lg font-mono text-xs"
              >{APP_VERSION}</Badge
            >
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
