<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { IconPencil, IconTrash } from "@tabler/icons-svelte";
  import type { KbCollection } from "./kbTypes";

  let {
    collection,
    onEdit,
    onDelete,
  }: {
    collection: KbCollection;
    onEdit?: () => void;
    onDelete?: () => void;
  } = $props();

  /** 极简相对时间，避免在卡片里引入 dayjs 等额外依赖。 */
  function formatRelative(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const diff = Date.now() - date.getTime();
    const rtf = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < hour) return rtf.format(-Math.round(diff / minute), "minute");
    if (diff < day) return rtf.format(-Math.round(diff / hour), "hour");
    if (diff < 30 * day) return rtf.format(-Math.round(diff / day), "day");
    return date.toLocaleDateString("zh-CN");
  }
</script>

<article
  class="group flex h-full flex-col rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-xl has-focus-visible:-translate-y-0.5 has-focus-visible:shadow-xl"
>
  <div class="min-w-0">
    <div class="flex min-w-0 items-start justify-between gap-3">
      <h3 class="min-w-0 truncate text-lg font-medium" title={collection.name}>
        {collection.name}
      </h3>
      <Badge variant="secondary" class="shrink-0 rounded-lg text-xs">
        {collection.docs.length} 个文档
      </Badge>
    </div>

    <p class="mt-2 line-clamp-2 wrap-break-word text-sm text-muted-foreground">
      {collection.description || "暂无简介"}
    </p>
  </div>

  <div class="mt-auto flex items-center justify-between gap-3 pt-4">
    <span class="truncate text-xs text-muted-foreground/70">
      {formatRelative(collection.updatedAt)}
    </span>

    <div class="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        class="gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-all duration-200 hover:text-foreground"
        aria-label={`编辑 ${collection.name}`}
        onclick={() => onEdit?.()}
      >
        <IconPencil size={14} stroke={1.5} />
        编辑
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-7 shrink-0 rounded-lg text-muted-foreground/60 transition-all duration-200 hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive"
        aria-label={`删除 ${collection.name}`}
        title="删除知识集"
        onclick={() => onDelete?.()}
      >
        <IconTrash size={14} stroke={1.5} />
      </Button>
    </div>
  </div>
</article>
