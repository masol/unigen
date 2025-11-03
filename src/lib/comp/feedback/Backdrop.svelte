<script lang="ts">
	import { loadingStore } from '$lib/stores/loading.svelte';
	import Loading from './Loading.svelte';

	let text = $derived(loadingStore.text);
	let showBackdrop = $derived(loadingStore.showBackdrop);

	// 阻止键盘事件
	function preventKeyboard(event: KeyboardEvent) {
		if (showBackdrop) {
			event.preventDefault();
			event.stopPropagation();
		}
	}
</script>

<svelte:window
	on:keydown={preventKeyboard}
	on:keyup={preventKeyboard}
	on:keypress={preventKeyboard}
/>

{#if showBackdrop}
	<Loading></Loading>
{/if}
