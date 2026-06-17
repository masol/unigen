<script lang="ts">
  import { IconDatabaseExport, IconDatabaseImport } from "@tabler/icons-svelte";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "svelte-sonner";
  import { api } from "$lib/utils/api";
  import { configStore } from "$lib/store/config.svelte";

  let fileInput: HTMLInputElement;

  async function handleBackup() {
    let url: string | null = null;
    let anchor: HTMLAnchorElement | null = null;

    try {
      const config = await api().config.getAll();
      const json = JSON.stringify(config, null, 2);
      const blob = new Blob([json], { type: "application/json" });

      url = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `config-backup-${new Date().toISOString().slice(0, 10)}.json`;

      document.body.appendChild(anchor);
      anchor.click();

      // 等待浏览器发起下载后再提示
      await new Promise((resolve) => setTimeout(resolve, 150));

      toast.success("备份成功");
    } catch (e) {
      toast.error(`备份失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (anchor) document.body.removeChild(anchor);
      if (url) URL.revokeObjectURL(url);
    }
  }

  function handleRestore() {
    fileInput.click();
  }

  async function onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const config = JSON.parse(content);
      await configStore.setAll(config);
      toast.success("恢复成功");
    } catch (e) {
      toast.error(`恢复失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      input.value = "";
    }
  }
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".json"
  class="hidden"
  onchange={onFileSelected}
/>

<section class="space-y-4">
  <h2 class="text-lg font-medium text-foreground px-1">数据管理</h2>
  <div
    class="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-border"
  >
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-8 p-6"
    >
      <div class="flex items-center gap-4 min-w-0">
        <div
          class="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0"
        >
          <IconDatabaseExport
            size={20}
            stroke={1.5}
            class="text-muted-foreground"
          />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-foreground">备份与恢复</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            导出当前配置数据，或从备份文件中恢复
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <Button
          variant="outline"
          class="rounded-xl gap-2 transition-all duration-200"
          onclick={handleBackup}
        >
          <IconDatabaseExport size={16} stroke={1.5} />
          备份数据
        </Button>
        <Button
          variant="outline"
          class="rounded-xl gap-2 transition-all duration-200"
          onclick={handleRestore}
        >
          <IconDatabaseImport size={16} stroke={1.5} />
          恢复数据
        </Button>
      </div>
    </div>
  </div>
</section>
