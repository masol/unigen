<script lang="ts">
	import ContextMenu from './Contextmenu.svelte';
	import { onDestroy, onMount } from 'svelte';
	import LoadingComp from '$lib/comp/feedback/Loading.svelte';
	import { ReteAdapter } from './adapter';

	// ref id--> belong to id for db!!.
	let {
		rid = ''
	}: {
		rid: string;
	} = $props();

	let el: HTMLDivElement;
	let adapter: ReteAdapter | undefined;
	let isDraggingOver = $state(false);
	let isLoading = $state(true);

	onMount(async () => {
		const old = el.style.display;
		el.style.display = 'none';

		const { RetEditor } = await import('$lib/utils/rete/index.js');
		adapter = new ReteAdapter(new RetEditor(el, rid));
		await adapter.init();

		el.style.display = old;

		// 使用原生事件监听器
		el.addEventListener('dragover', handleDragOver);
		el.addEventListener('dragleave', handleDragLeave);
		el.addEventListener('drop', handleDrop);

		isLoading = false;
	});

	onDestroy(() => {
		// console.log('destroy editor');
		if (adapter) {
			adapter.destroy();
			adapter = undefined;
		}
		if (el) {
			el.removeEventListener('dragover', handleDragOver);
			el.removeEventListener('dragleave', handleDragLeave);
			el.removeEventListener('drop', handleDrop);
		}
	});

	async function onEvent(cmd: string, data?: unknown) {
		if (adapter) {
			return adapter.onEvent(cmd, data);
		}
	}

	function nodeFromEle(e: MouseEvent): string | undefined {
		if (adapter) {
			return adapter.nodeFromEle(e);
		}
		return undefined;
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

		if (!adapter || !e.dataTransfer) return;

		try {
			const jsonData = e.dataTransfer.getData('application/json');

			if (jsonData) {
				const data = JSON.parse(jsonData);
				// console.log('drop data=', data);

				if (data.type === 'functor') {
					const rect = el.getBoundingClientRect();
					const x = e.clientX - rect.left;
					const y = e.clientY - rect.top;

					adapter.newNode({
						id: crypto.randomUUID(),
						label: data.word,
						x,
						y,
						ref_id: data.id
					});
				}
			}
		} catch (error) {
			console.error('Error handling drop:', error);
		}
	}
</script>

<div class="relative h-full w-full">
	<ContextMenu onMenucmd={onEvent} {nodeFromEle}>
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

	{#if isLoading}
		<!-- Loading 覆盖层 -->
		<div
			class="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-gray-900/80"
			role="alert"
			aria-live="polite"
			aria-busy="true"
		>
			<LoadingComp />
		</div>
	{/if}
</div>
