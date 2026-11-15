<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
</script>

<div class="flex h-full w-full animate-fade-in flex-col gap-6 p-8">
  <div class="flex shrink-0 items-center justify-between gap-6">
    <div class="min-w-0 space-y-3">
      <Skeleton class="h-8 w-72 rounded-xl" />
      <Skeleton class="h-4 w-96 max-w-full rounded-lg" />
    </div>
    <Skeleton class="h-10 w-28 rounded-xl" />
  </div>
  <Skeleton class="min-h-0 flex-1 rounded-2xl" />
</div>
