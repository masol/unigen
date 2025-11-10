<!-- src/lib/components/EntityList.svelte -->
<script lang="ts">
	import EntityListItem from './Item.svelte';
	import { entityStore } from '$lib/stores/project/entity.svelte';
	import { navStore } from '$lib/stores/navpanel/nav.svelte';

	// void navStore.filter;
	// @todo 使用flexsearch优化检索流程，提升检索体验．
	const entities = $derived.by(() => {
		if (navStore.filter)
			return entityStore.entities.filter((ent) => (ent.word ?? '').includes(navStore.filter));
		return entityStore.entities;
	});
</script>

<nav class="absolute inset-0 flex flex-col bg-surface-100 dark:bg-surface-800">
	<div class="flex-1 overflow-y-auto p-4">
		<div class="space-y-2">
			{#each entities as entity (entity.id)}
				<EntityListItem {entity} />
			{/each}
		</div>
	</div>
</nav>
