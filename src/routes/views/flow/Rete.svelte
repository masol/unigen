<script lang="ts">
	import type { IRetEditor } from '$lib/utils/rete/type';
	import ContextMenu from './Contextmenu.svelte';
	import { onDestroy, onMount } from 'svelte';

	let el: HTMLDivElement;
	let editor: IRetEditor | undefined;
	let isDraggingOver = false;

	onMount(async () => {
		const old = el.style.display;
		el.style.display = 'none';
		const { RetEditor } = await import('$lib/utils/rete/index.js');
		editor = new RetEditor(el);
		await editor.init();
		el.style.display = old;
	});

	function onMenucmd(cmd: string, param?: Record<string, any>) {
		if (!editor) return;
		switch (cmd) {
			case 'reset':
				return editor.reset();
			case 'newnode':
				return editor.newNode({
					x: param?.clientX || 0,
					y: param?.clientY || 0
				});
			case 'layout':
				return editor.layout();
		}
	}

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

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (!e.dataTransfer) return;
		e.dataTransfer.dropEffect = 'copy';
		isDraggingOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		// 只有在离开整个容器时才设置为 false
		const relatedTarget = e.relatedTarget as Node | null;
		if (!relatedTarget || !el.contains(relatedTarget)) {
			isDraggingOver = false;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDraggingOver = false;

		if (!editor || !e.dataTransfer) return;

		try {
			const jsonData = e.dataTransfer.getData('application/json');

			if (jsonData) {
				const data = JSON.parse(jsonData);

				if (data.type === 'functor') {
					const rect = el.getBoundingClientRect();
					const x = e.clientX - rect.left;
					const y = e.clientY - rect.top;

					editor.newNode({
						label: data.word,
						x,
						y,
						functorId: data.functorId,
						functorWord: data.functorWord
					});

					// console.log('Dropped functor:', data);
				}
			}
		} catch (error) {
			console.error('Error handling drop:', error);
		}
	}
</script>

<ContextMenu {onMenucmd} {getMenuType}>
	<div
		class="relative h-full w-full border text-left text-base transition-all duration-200
			{isDraggingOver
			? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-400/50 dark:border-blue-400 dark:bg-blue-950/30 dark:ring-blue-500/50'
			: 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900'}"
		bind:this={el}
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
		on:drop={handleDrop}
		role="region"
		aria-label="编辑器拖放区域"
	></div>
</ContextMenu>
