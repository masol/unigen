<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";

  type Props = {
    environmentId: string;
    config: Record<string, unknown>;
    onPatch: (patch: Record<string, unknown>) => void;
  };
  let { config, onPatch }: Props = $props();

  let modelPath = $state(String(config.modelPath ?? ""));
  let port = $state(String(config.port ?? 8080));
  let contextSize = $state(String(config.contextSize ?? 4096));
  let gpuLayers = $state(String(config.gpuLayers ?? 0));

  $effect(() => {
    modelPath = String(config.modelPath ?? "");
    port = String(config.port ?? 8080);
    contextSize = String(config.contextSize ?? 4096);
    gpuLayers = String(config.gpuLayers ?? 0);
  });

  function save() {
    onPatch({
      modelPath,
      port: Number(port) || 8080,
      contextSize: Number(contextSize) || 4096,
      gpuLayers: Number(gpuLayers) || 0,
    });
  }
</script>

<section class="space-y-3 rounded-2xl border border-border/50 bg-card p-5">
  <div class="flex items-center justify-between gap-2">
    <div>
      <p class="text-sm font-semibold text-foreground">llama.cpp 参数</p>
      <p class="text-xs text-muted-foreground">推理与嵌入模型服务参数。</p>
    </div>
    <Button variant="outline" size="sm" class="rounded-lg" onclick={save}>
      保存
    </Button>
  </div>

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label class="space-y-1 sm:col-span-2">
      <span class="text-[11px] text-muted-foreground">模型路径</span>
      <Input
        bind:value={modelPath}
        placeholder="/path/to/model.gguf"
        class="h-9 rounded-lg text-xs"
      />
    </label>
    <label class="space-y-1">
      <span class="text-[11px] text-muted-foreground">端口</span>
      <Input bind:value={port} class="h-9 rounded-lg text-xs" />
    </label>
    <label class="space-y-1">
      <span class="text-[11px] text-muted-foreground">上下文长度</span>
      <Input bind:value={contextSize} class="h-9 rounded-lg text-xs" />
    </label>
    <label class="space-y-1">
      <span class="text-[11px] text-muted-foreground">GPU 层数</span>
      <Input bind:value={gpuLayers} class="h-9 rounded-lg text-xs" />
    </label>
  </div>
</section>
