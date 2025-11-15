<script lang="ts">
	import { flowStore } from '$lib/stores/project/flow.svelte';
	import WordList from '$lib/comp/sidebar/WordList.svelte';
	import IconFlowchart from '~icons/mdi/chart-timeline-variant';
</script>

<nav class="absolute inset-0 flex flex-col bg-surface-100 dark:bg-surface-800">
	<div class="flex-1 overflow-y-auto p-4">
		<div class="space-y-2">
			<WordList
				icon={IconFlowchart}
				viewType={'flow'}
				items={flowStore.items}
				deleteWord={async (id: string) => {
					flowStore.delete(id);
				}}
				updateWord={async (id: string, newWord: string) => {
					flowStore.updateName(id, newWord);
				}}
			></WordList>
		</div>
	</div>
</nav>
