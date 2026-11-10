<!-- 用户消息附件清单 · 极简 chip（icon + 扩展名）· 单击打开 · 悬停浮出完整路径 -->
<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { safeApi } from "$lib/utils/api";
  import { IconFile } from "@tabler/icons-svelte";

  let { files = [] }: { files?: string[] } = $props();

  function basename(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  }

  function extname(path: string): string {
    const base = basename(path);
    const dot = base.lastIndexOf(".");
    if (dot <= 0 || dot === base.length - 1) return "FILE";
    return base
      .slice(dot + 1)
      .toUpperCase()
      .slice(0, 4);
  }

  // 单击打开本地文件；调用后即忘（与 AttachmentMenu 行为一致）
  function openFile(path: string) {
    void safeApi().system.openPath({ path });
  }
</script>

{#if files.length > 0}
  <Tooltip.Provider delayDuration={200}>
    <div class="flex flex-wrap justify-end gap-1.5 self-end">
      {#each files as file (file)}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                onclick={() => openFile(file)}
                aria-label={`打开附件 ${basename(file)}`}
                class="inline-flex h-6 items-center gap-1 rounded-lg border border-border/50 bg-muted/30 px-1.5 text-[10px] font-medium uppercase tracking-tight text-muted-foreground transition-all duration-200 hover:border-border hover:bg-accent hover:text-foreground active:scale-95"
              >
                <IconFile size={11} stroke={1.5} class="shrink-0" />
                <span>{extname(file)}</span>
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="top" align="end" class="max-w-xs">
            <p class="break-all text-xs font-medium">{basename(file)}</p>
            <p class="mt-1 break-all text-xs text-muted-foreground">{file}</p>
            <p class="mt-1.5 text-xs text-muted-foreground/70">点击打开</p>
          </Tooltip.Content>
        </Tooltip.Root>
      {/each}
    </div>
  </Tooltip.Provider>
{/if}
