<!-- src/lib/flow/StatusDot.svelte -->
<script lang="ts">
  import { STATUS_TONE, type NodeStatus } from "./store.svelte";

  let { status }: { status: NodeStatus } = $props();

  const tone = $derived(STATUS_TONE[status]);
  const cls = $derived(
    tone === "destructive"
      ? "bg-destructive"
      : tone === "primary"
        ? "bg-primary"
        : tone === "accent"
          ? "bg-accent-foreground"
          : "bg-muted-foreground/50",
  );
  const pulsing = $derived(
    status === "expanding" || status === "awaiting_code",
  );
</script>

<span class="relative flex size-2.5 shrink-0">
  {#if pulsing}
    <span
      class={[
        "absolute inline-flex size-full animate-ping rounded-full opacity-60",
        cls,
      ]}
    ></span>
  {/if}
  <span class={["relative inline-flex size-2.5 rounded-full", cls]}></span>
</span>
