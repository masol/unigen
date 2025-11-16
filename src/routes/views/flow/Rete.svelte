<script lang="ts">
	import { viewStore } from '$lib/stores/project/view.svelte';
	import { eventBus } from '$lib/utils/evt';
	import type { IRetEditor } from '$lib/utils/rete/type';
	import type { FunctorData } from '$lib/utils/vocab/type';
	import pMap from 'p-map';
	import ContextMenu from './Contextmenu.svelte';
	import { onDestroy, onMount } from 'svelte';
	import { functorStore } from '$lib/stores/project/functor.svelte';
	import LoadingComp from '$lib/comp/feedback/Loading.svelte';

	// ref id--> belong to id for db!!.
	let {
		rid = ''
	}: {
		rid: string;
	} = $props();

	let el: HTMLDivElement;
	let editor: IRetEditor | undefined;
	let isDraggingOver = $state(false);
	let unsub: (() => void) | undefined;
	let unsub2: (() => void) | undefined;
	let isLoading = $state(true);

	onMount(async () => {
		const old = el.style.display;
		el.style.display = 'none';
		const { RetEditor } = await import('$lib/utils/rete/index.js');
		editor = new RetEditor(el, rid);
		editor.onEvent = onEvent;
		await editor.init();
		el.style.display = old;

		// 使用原生事件监听器
		el.addEventListener('dragover', handleDragOver);
		el.addEventListener('dragleave', handleDragLeave);
		el.addEventListener('drop', handleDrop);

		unsub = await eventBus.listen('functor.updated', async (event) => {
			// console.log("recieved functor.updated!!!!")
			const item = event as FunctorData;
			const nodes = editor?.node4fuctor(item.id);
			// console.log("item=",item);
			// console.log("found nodes for updated=",JSON.stringify(nodes));
			if (!nodes || nodes.length === 0) {
				return;
			}
			await pMap(
				nodes,
				async (n) => {
					await editor?.updNode(n.id, {
						label: item.word,
						fid: item.id
					});
				},
				{ concurrency: 30 }
			);
			// console.log('item changed=', item);
		});

		unsub2 = await eventBus.listen('functor.remove', async (event) => {
			// console.log("on functor removed:",event);
			const fid = (event as Record<string, string>).id;
			const nodes = editor?.node4fuctor(fid);
			// console.log('found nodes=', nodes);
			if (!nodes || nodes.length === 0) {
				return;
			}
			await pMap(
				nodes,
				async (n) => {
					await editor?.rmNode(n.id);
				},
				{ concurrency: 30 }
			);
		});

		isLoading = false;
	});

	async function onEvent(cmd: string, data?: unknown) {
		if (!editor) return;
		const param: Record<string, unknown> = data as Record<string, unknown>;
		switch (cmd) {
			case 'reset':
				editor.reset();
				break;
			case 'detail':
				if (param?.id) {
					// const node = editor?.getNO
					const node = editor.getNode(param.id as string);
					if (node && node.fid) {
						functorStore.openView(node.fid);
					}
				}
				break;
			case 'newnode':
				// 首先创建新行为.
				const word = await functorStore.newItem();
				const id = crypto.randomUUID();
				await editor.newNode({
					label: word.word,
					id,
					fid: word.id,
					x: param?.clientX || 0,
					y: param?.clientY || 0
				});
				break;
			case 'layout':
				await editor.layout();
				break;
			case 'rmNode':
				if (param && param.id) {
					await editor.rmNode(param.id as string);
				}
				break;
			case 'nodepicked':
				if (param?.id) {
					viewStore.selectedItem = param.id as string;
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
	}

	onDestroy(() => {
		// console.log('destroy editor');
		if (unsub) {
			unsub();
			unsub = undefined;
		}
		if (unsub2) {
			unsub2();
			unsub2 = undefined;
		}
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

	function nodeFromEle(e: MouseEvent): string | undefined {
		if (editor) {
			const targetElement = e.target as HTMLElement;
			return editor.nodeFromElement(targetElement);
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

		if (!editor || !e.dataTransfer) return;

		try {
			const jsonData = e.dataTransfer.getData('application/json');

			if (jsonData) {
				const data = JSON.parse(jsonData);
				// console.log('drop data=', data);

				if (data.type === 'functor') {
					const rect = el.getBoundingClientRect();
					const x = e.clientX - rect.left;
					const y = e.clientY - rect.top;

					editor.newNode({
						id: crypto.randomUUID(),
						label: data.word,
						x,
						y,
						fid: data.id
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
