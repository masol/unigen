<!-- packages/renderer/src/lib/components/leftside/session/session.group.svelte -->
<script lang="ts">
  import type { TimeGroup } from "$lib/store/local/session.store.svelte";

  let { group }: { group: TimeGroup } = $props();
</script>

<!-- 借鉴 DeepSeek：分组标题为静态标签，不可折叠。
     折叠会让列表项数量突变，虚拟列表与 autoAnimate 同时重排，
     是右侧滚动条抖动的主要来源。 -->
<div class="flex select-none items-center gap-2 px-2.5 pb-1 pt-4">
  <span
    class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
  >
    {group.label}
  </span>
  <span class="text-[11px] tabular-nums text-muted-foreground/60">
    {group.sessions.length}
  </span>
</div>
