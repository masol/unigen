<script lang="ts">
  import { Edra } from "$lib/components/edra/shadcn/index.js";

  let { class: className = "" }: { class?: string } = $props();
</script>

<!-- 去掉卡片边框、背景、圆角与阴影；正文全宽铺满，仅保留左右内边距 -->
<div class="h-full w-full {className}">
  <Edra.Content class="w-full cursor-text px-8 py-8 *:outline-none" />
</div>
