<script lang="ts">
  import { Switch } from "$lib/components/ui/switch";

  type Props = {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (value: boolean) => void;
  };
  let { label, description, checked, onChange }: Props = $props();
</script>

<div
  class="flex items-start justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2.5"
>
  <div class="min-w-0 space-y-0.5">
    <p class="text-xs font-medium text-foreground">{label}</p>
    {#if description}
      <p class="text-[11px] text-muted-foreground">{description}</p>
    {/if}
  </div>
  <Switch {checked} onCheckedChange={onChange} aria-label={label} />
</div>
