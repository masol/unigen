<script lang="ts">
  import type { DialogComponentProps } from "$lib/types/dialog";
  import McpMarketGuide from "./McpMarketGuide.svelte";

  type Props = {
    onOpen?: (url: string) => void;
  } & DialogComponentProps<void>;

  let { onOpen }: Props = $props();
</script>

<div class="py-4">
  <McpMarketGuide {onOpen} dense />
</div>
