<!-- packages/renderer/src/route/featured/leftside/session/session.skeleton.svelte -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
</script>

<div class="space-y-6 animate-fade-in">
  {#each [1, 2, 3] as _groupIndex (_groupIndex)}
    <div class="space-y-2">
      <Skeleton class="h-5 w-16 rounded-lg" />
      {#each [1, 2] as _itemIndex (_itemIndex)}
        <Skeleton class="h-14 w-full rounded-xl" />
      {/each}
    </div>
  {/each}
</div>
