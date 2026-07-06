<!-- $lib/components/glossary/glossary-name-cell.svelte -->
<script lang="ts">
  let { name }: { name: string } = $props();
</script>

<span class="block truncate text-sm font-medium text-foreground" title={name}>
  {name}
</span>
