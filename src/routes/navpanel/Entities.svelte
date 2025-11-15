<script lang="ts">
	import { entityStore } from '$lib/stores/project/entity.svelte';
	import WordList from '$lib/comp/sidebar/WordList.svelte';
	import IconText from '~icons/mdi/text-box';
</script>

<nav class="absolute inset-0 flex flex-col bg-surface-100 dark:bg-surface-800">
	<div class="flex-1 overflow-y-auto p-4">
		<div class="space-y-2">
			<WordList
				icon={IconText}
				viewType={'entities'}
				draggable={false}
				items={entityStore.items}
				deleteWord={async (id: string) => {
					entityStore.delete(id);
				}}
				updateWord={async (id: string, newWord: string) => {
					entityStore.updateName(id, newWord);
				}}
			></WordList>
		</div>
	</div>
</nav>
