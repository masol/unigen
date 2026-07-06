<!-- SettingsSection.svelte -->
<script lang="ts">
  import type { Icon as IconType } from "@tabler/icons-svelte";
  import type { Snippet } from "svelte";

  let {
    icon,
    title,
    description,
    children,
  }: {
    icon?: IconType;
    title?: string;
    description?: string;
    children?: Snippet;
  } = $props();

  const IconComponent = $derived(icon);
</script>

<section class="space-y-6">
  <!-- Section Header -->
  <div class="flex items-center gap-3">
    {#if IconComponent}
      <div
        class="flex items-center justify-center size-9 rounded-xl bg-primary/10"
      >
        <IconComponent size={20} stroke={1.5} class="text-primary" />
      </div>
    {/if}
    <div>
      <h2 class="text-lg font-medium text-foreground">{title}</h2>
      {#if description}
        <p class="text-xs text-muted-foreground mt-0.5">{description}</p>
      {/if}
    </div>
  </div>

  <!-- Section Body Card -->
  <div
    class="rounded-2xl border border-border/50 bg-card shadow-sm divide-y divide-border/50 overflow-hidden"
  >
    {@render children?.()}
  </div>
</section>
