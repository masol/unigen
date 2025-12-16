<script lang="ts">
	import Panel from './Panel.svelte';
	import type { PanelStore } from './panelStore.svelte';

	interface Props {
		view: string;
		store?: PanelStore; // 可选，可能在 onMount 后才有值
	}

	let { view, store }: Props = $props();

	// 安全地获取 panels，处理 store 为 undefined 的情况
	let viewPanels = $derived(store ? store.getAllPanels() : []);
</script>

{#if store}
	{#each viewPanels as panel (panel.id)}
		<Panel id={panel.id} {view} {store} />
	{/each}
{/if}
