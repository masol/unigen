<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconAlertCircle,
    IconFile,
    IconFileText,
    IconFileTypeDoc,
    IconFileTypePdf,
    IconLoader2,
    IconX,
  } from "@tabler/icons-svelte";
  import type { KbDoc } from "./kbTypes";

  let {
    docs = [],
    onRemove,
  }: {
    docs?: KbDoc[];
    onRemove?: (id: string) => void;
  } = $props();

  function docIcon(kind: string) {
    const k = kind.toLowerCase();
    if (k === "pdf") return IconFileTypePdf;
    if (k === "doc" || k === "docx") return IconFileTypeDoc;
    if (k === "md" || k === "txt") return IconFileText;
    return IconFile;
  }

  /** 只在异常状态给出文字提示；ready 保持单行，降低列表噪音。 */
  function statusText(status: KbDoc["status"]): string {
    if (status === "converting") return "转换中";
    if (status === "failed") return "转换失败";
    return "";
  }
</script>

{#if docs.length === 0}
  <div
    class="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-8 text-center"
  >
    <IconFileText size={24} stroke={1.5} class="text-muted-foreground/50" />
    <p class="text-xs text-muted-foreground">
      还没有文档，点击上方「添加文档」
    </p>
  </div>
{:else}
  <ul class="max-h-64 space-y-2 overflow-y-auto pr-1" use:autoAnimate>
    {#each docs as doc (doc.id)}
      {@const Icon = docIcon(doc.kind)}
      {@const status = statusText(doc.status)}
      <li
        class="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-3 py-2.5"
      >
        <Icon size={18} stroke={1.5} class="shrink-0 text-muted-foreground" />

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm" title={doc.path ?? doc.name}>
            {doc.name}
          </p>
          {#if status}
            <p
              class="text-xs {doc.status === 'failed'
                ? 'text-destructive'
                : 'text-muted-foreground'}"
            >
              {status}
            </p>
          {/if}
        </div>

        {#if doc.status === "converting"}
          <IconLoader2
            size={14}
            stroke={1.5}
            class="shrink-0 animate-spin text-muted-foreground"
          />
        {:else if doc.status === "failed"}
          <IconAlertCircle
            size={14}
            stroke={1.5}
            class="shrink-0 text-destructive"
          />
        {/if}

        <Button
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 rounded-lg text-muted-foreground/60 transition-all duration-200 hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive"
          aria-label={`移除 ${doc.name}`}
          title="移除文档"
          onclick={() => onRemove?.(doc.id)}
        >
          <IconX size={14} stroke={1.5} />
        </Button>
      </li>
    {/each}
  </ul>
{/if}
