<script lang="ts">
	import TextModelSettings from './panels/textmodel/Main.svelte';
	import NetworkSettings from './panels/network/Main.svelte';
	import { settingStore } from '$lib/stores/views/setting/setting.svelte';
	// import EditorSettings from './panels/EditorSettings.svelte';
	// import ImageModelSettings from './panels/ImageModelSettings.svelte';

	let selectedPanel = $derived(settingStore.curCate);
</script>

<div class="flex h-full flex-col">
	<div class="flex-1 overflow-y-auto px-8 py-6 pb-24">
		{#if selectedPanel === 'llm'}
			<TextModelSettings></TextModelSettings>
		{:else if selectedPanel === 'network'}
			<NetworkSettings></NetworkSettings>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-gray-500">请从左侧选择设置项</p>
			</div>
		{/if}
	</div>
</div>
