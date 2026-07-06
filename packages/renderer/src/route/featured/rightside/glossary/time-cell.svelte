<!-- $lib/components/glossary/glossary-time-cell.svelte -->
<script lang="ts">
  import { i18nStore } from "$lib/store/i18n.svelte";

  let { value }: { value: string } = $props();

  // fromNow 相对时间；字符串有最大长度，故列宽固定
  const relative = $derived(i18nStore.dayjs(value).fromNow());
</script>

<span
  class="block whitespace-nowrap text-end text-xs text-muted-foreground tabular-nums"
  title={value}
>
  {relative}
</span>
