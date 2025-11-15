<script lang="ts">
	import { viewStore } from '$lib/stores/project/view.svelte';
	import type { IRetEditor } from '$lib/utils/rete/type';
	import ContextMenu from './Contextmenu.svelte';
	import { onDestroy, onMount } from 'svelte';

	let el: HTMLDivElement;
	let editor: IRetEditor | undefined;
	let isDraggingOver = false;
	let lastNode: string | undefined;

	onMount(async () => {
		const old = el.style.display;
		el.style.display = 'none';
		const { RetEditor } = await import('$lib/utils/rete/index.js');
		editor = new RetEditor(el);
		editor.onEvent = onEvent;
		await editor.init();
		el.style.display = old;

		// 使用原生事件监听器
		el.addEventListener('dragover', handleDragOver);
		el.addEventListener('dragleave', handleDragLeave);
		el.addEventListener('drop', handleDrop);
	});

	async function onEvent(cmd: string, param?: Record<string, any>) {
		if (!editor) return;
		switch (cmd) {
			case 'reset':
				editor.reset();
				break;
			case 'newnode':
				await editor.newNode({
					x: param?.clientX || 0,
					y: param?.clientY || 0
				});
				break;
			case 'layout':
				await editor.layout();
				break;
			case 'rmNode':
				if (lastNode) {
					await editor.rmNode(lastNode);
				}
				break;
			case 'nodepicked':
				if (param?.id) {
					viewStore.selectedItem = param.id;
					console.log('节点被选中:', param.id);
				}
				break;
			case 'pointerdown':
				if (!param?.id) {
					viewStore.selectedItem = '';
					console.log('节点别移除选择！！！');
				}
				break;
			case 'connectioncreate':
				if (param?.id) {
					// param.id = crypto.randomUUID();
				}
				console.log('connectioncreate', param);
				break;
			case 'connectioncreated':
				console.log('connectioncreated', param);
				break;
		}
		lastNode = undefined;
	}

	onDestroy(() => {
		if (el) {
			el.removeEventListener('dragover', handleDragOver);
			el.removeEventListener('dragleave', handleDragLeave);
			el.removeEventListener('drop', handleDrop);
		}
		if (editor) {
			editor.destroy();
			editor = undefined;
		}
	});

	function getMenuType(e: MouseEvent): 'editor' | 'node' {
		if (editor) {
			const targetElement = e.target as HTMLElement;
			lastNode = editor.nodeFromElement(targetElement);
			return lastNode ? 'node' : 'editor';
		}
		return 'editor';
	}

	function handleDragOver(e: DragEvent) {
		// console.log('drag over=', e);
		e.preventDefault();
		e.stopPropagation();
		if (!e.dataTransfer) return;
		e.dataTransfer.dropEffect = 'copy';
		isDraggingOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		// console.log('handleDragLeave over=', e);
		const relatedTarget = e.relatedTarget as Node | null;
		if (!relatedTarget || !el.contains(relatedTarget)) {
			isDraggingOver = false;
		}
	}

	function handleDrop(e: DragEvent) {
		// console.log('handleDrop=', e);
		e.preventDefault();
		e.stopPropagation();
		isDraggingOver = false;

		if (!editor || !e.dataTransfer) return;

		try {
			const jsonData = e.dataTransfer.getData('application/json');

			if (jsonData) {
				const data = JSON.parse(jsonData);
				console.log('drop data=', data);

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
				}
			}
		} catch (error) {
			console.error('Error handling drop:', error);
		}
	}
</script>

<ContextMenu onMenucmd={onEvent} {getMenuType}>
	<div
		class="relative h-full w-full border text-left text-base transition-all duration-200
			{isDraggingOver
			? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-400/50 dark:border-blue-400 dark:bg-blue-950/30 dark:ring-blue-500/50'
			: 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900'}"
		bind:this={el}
		role="region"
		aria-label="编辑器拖放区域"
	></div>
</ContextMenu>
