<!-- 主组件 -->
<script lang="ts">
	import type { IRetEditor } from '$lib/utils/rete/type';
	import ContextMenu from './Contextmenu.svelte';
	import { onDestroy, onMount } from 'svelte';

	let el: HTMLDivElement;
	let editor: IRetEditor | undefined;

	onMount(async () => {
		const { RetEditor } = await import('$lib/utils/rete/index.js');
		editor = new RetEditor(el);
		await editor.init();
	});

	onDestroy(() => {
		if (editor) {
			editor.destroy();
			editor = undefined;
		}
	});

	function getMenuType(e: MouseEvent): 'editor' | 'node' {
		const targetElement = e.target as HTMLElement;
		return targetElement.closest('[data-testid="node"]') ? 'node' : 'editor';
	}
</script>

<ContextMenu onMenucmd={(cmd) => console.log(cmd)} {getMenuType}>
	<div
		class="relative h-full w-full border border-gray-300 text-left text-base"
		bind:this={el}
	></div>
</ContextMenu>
