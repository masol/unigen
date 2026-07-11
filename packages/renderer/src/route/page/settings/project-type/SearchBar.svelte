<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { IconSearch } from "@tabler/icons-svelte";

  type Props = {
    value: string;
    placeholder?: string;
    disabled?: boolean;
    oninput?: (value: string) => void;
  };
  let {
    value = $bindable(""),
    placeholder = "搜索…",
    disabled = false,
    oninput,
  }: Props = $props();
</script>

<div class="relative">
  <IconSearch
    class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
  />
  <Input
    bind:value
    oninput={() => oninput?.(value)}
    {placeholder}
    {disabled}
    class="h-11 rounded-xl pl-10 text-sm"
  />
</div>
