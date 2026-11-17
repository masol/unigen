<script lang="ts">
  import { TRI_STATE_OPTIONS, type TriState } from "./pac-environment-types";

  let {
    value = $bindable("unset" as TriState),
    ariaLabel,
  }: {
    value?: TriState;
    ariaLabel?: string;
  } = $props();

  const selected = $derived(
    TRI_STATE_OPTIONS.find((option) => option.value === value) ??
      TRI_STATE_OPTIONS[0],
  );

  const toneClass = $derived(
    selected.tone === "positive"
      ? "text-emerald-600"
      : selected.tone === "negative"
        ? "text-destructive"
        : "text-muted-foreground",
  );
</script>

<div class="relative">
  <span
    class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm {toneClass}"
    aria-hidden="true"
  >
    {selected.icon}
  </span>
  <select
    class="w-full rounded-xl border border-border/60 bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
    bind:value
    aria-label={ariaLabel}
  >
    {#each TRI_STATE_OPTIONS as option (option.value)}
      <option value={option.value}>{option.icon} {option.label}</option>
    {/each}
  </select>
</div>
