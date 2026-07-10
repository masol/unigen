<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { configStore } from "$lib/store/config.svelte";
  import { api } from "$lib/utils/api";
  import { IconDatabaseExport, IconDatabaseImport } from "@tabler/icons-svelte";
  import dayjs from "dayjs";
  import { toast } from "svelte-sonner";

  let fileInput: HTMLInputElement;

  async function handleBackup() {
    try {
      const config = await api().config.getAll();
      const json = JSON.stringify(config, null, 2);
      const defaultName = `unigen-config-${dayjs().format("YYYY-MM-DD")}.json`;

      const result = await api().system.saveFile({
        data: json,
        defaultName,
        filters: "json",
      });

      if (result.canceled) return;
      if (!result.success) throw new Error("写入文件失败");

      toast.success("备份成功");
    } catch (e) {
      toast.error(`备份失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 点击“恢复数据”：触发浏览器端文件选择对话框
  function handleRestoreClick() {
    fileInput?.click();
  }

  // 浏览器端对话框选中文件后：读取内容并继续向下送
  async function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];

    // 重置 value，保证选择同一文件也能再次触发 change
    input.value = "";
    if (!file) return;

    try {
      const content = await file.text();
      if (!content) throw new Error("读取文件失败");

      const config = JSON.parse(content);
      await configStore.setAll(config);

      toast.success("恢复成功");
    } catch (e) {
      toast.error(`恢复失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
</script>

<section class="space-y-4">
  <h2 class="text-lg font-medium text-foreground px-1">配置管理</h2>
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
          备份配置
        </Button>
        <Button
          variant="outline"
          class="rounded-xl gap-2 transition-all duration-200"
          onclick={handleRestoreClick}
        >
          <IconDatabaseImport size={16} stroke={1.5} />
          恢复配置
        </Button>
      </div>
    </div>
  </div>

  <!-- 恢复：浏览器端隐藏文件输入 -->
  <input
    bind:this={fileInput}
    type="file"
    accept="application/json,.json"
    class="hidden"
    onchange={handleFileChange}
  />
</section>
