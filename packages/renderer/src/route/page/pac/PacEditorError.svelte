<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { pacStore } from "$lib/store/ui/pac.svelte";
  import { IconAlertTriangle, IconRefresh } from "@tabler/icons-svelte";
</script>

<div class="flex h-full w-full animate-fade-in items-center justify-center p-8">
  <div
    class="w-full max-w-md rounded-3xl border border-border/50 bg-card p-8 text-center shadow-sm"
  >
    <div
      class="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"
    >
      <IconAlertTriangle size={24} stroke={1.5} />
    </div>

    <h2 class="mt-6 text-lg font-medium">文档加载失败</h2>
    <p class="mt-2 text-sm text-muted-foreground">
      {pacStore.error ?? "未知错误"}
    </p>

    <Button
      variant="outline"
      class="mt-6 rounded-xl"
      onclick={() => {
        const id = pacStore.currentId;
        if (id) void pacStore.openFile(id);
      }}
    >
      <IconRefresh size={20} stroke={1.5} />
      重试
    </Button>
  </div>
</div>
