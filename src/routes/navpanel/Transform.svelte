<script lang="ts">
	import IconFunction from '~icons/mdi/function-variant';
	import WordList from '$lib/comp/sidebar/WordList.svelte';
	import { functorStore } from '$lib/stores/project/functor.svelte';
</script>

<nav class="absolute inset-0 flex flex-col bg-surface-100 dark:bg-surface-800">
	<div class="flex-1 overflow-y-auto p-4">
		<div class="space-y-2">
			<WordList
				icon={IconFunction}
				viewType={'function'}
				items={functorStore.items}
			></WordList>
		</div>
	</div>
</nav>
