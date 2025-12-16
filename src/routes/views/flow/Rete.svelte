<script lang="ts">
	import ContextMenu from './Contextmenu.svelte';
	import { getContext, onDestroy, onMount } from 'svelte';
	import LoadingComp from '$lib/comp/feedback/Loading.svelte';
	import { ReteAdapter } from './adapter';
	import { functorStore } from '$lib/stores/project/functor.svelte';
	// import type { PortConfig } from '$lib/utils/appdb/rete.type';
	// import { trimTo6 } from '$lib/utils/str';
	import FunctorDialog from './functor/Dialog.svelte';
	import { cvtIO } from './util';
	import type { FunctorData } from '$lib/utils/vocab/type';
	type ToastStore = ReturnType<typeof import('@skeletonlabs/skeleton-svelte').createToaster>;
	const toaster = getContext<ToastStore>('toaster');

	// import PanelManage from './PanelManage.svelte';
	// import type { PanelStore } from './panelStore.svelte';

	// ref id--> belong to id for db!!.
	let {
		rid = '',
		setAdapter
	}: {
		rid: string;
		setAdapter(editor: ReteAdapter): void;
	} = $props();

	let el: HTMLDivElement;
	let adapter: ReteAdapter | undefined;
	let isDraggingOver = $state(false);
	let isLoading = $state(true);
	let fid = $state(''); // 当前编辑的functor id.
	let nodeId = ''; // 当前编辑的node id.
	let open = $state(false); // 当前编辑器是否打开了．
	// let myPanelStore = $state<PanelStore | undefined>(undefined);

	onMount(async () => {
		const old = el.style.display;
		el.style.display = 'none';

		const { RetEditor } = await import('$lib/utils/rete/index.js');
		adapter = new ReteAdapter(new RetEditor(el, rid));
		setAdapter(adapter);
		await adapter.init();
		// myPanelStore = adapter.panelStore;

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
		//拦截前置处理部分cmd.
		const param: Record<string, unknown> = data as Record<string, unknown>;
		switch (cmd) {
			case 'detail':
				if (param?.id) {
					// const node = editor?.getNO
					const node = adapter?.editor.getNode(param.id as string);
					if (node && node.fid) {
						// functorStore.openView(node.fid);
						fid = node.fid;
						nodeId = node.id;
						open = true;
					}
				}
				return;
			default:
				if (adapter) {
					return adapter.onEvent(cmd, data);
				}
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

	async function onSave(functor: FunctorData) {
		const ios = cvtIO(functor);
		const node = adapter?.editor.getNode(nodeId);
		if (node && adapter) {
			await adapter.editor.updNodeSocks(node, ios.inputs, ios.outputs, true);
			await adapter.onNodeUpdated(node.id);
		}
	}

	async function handleDrop(e: DragEvent) {
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

					//从data.id中获取ref_id.

					const functor = functorStore.find(data.id);
					if (!functor) {
						console.error('未发现拖拽的functor...');
						return;
					}

					const ios = cvtIO(functor);
					await adapter.newNode({
						id: crypto.randomUUID(),
						label: data.word,
						x,
						y,
						ref_id: data.id,
						cached_input: ios.inputs,
						cached_output: ios.outputs
					});
				} else if (data.type === 'flow') {
					toaster.error({
						description: '尚未支持嵌套流程图．'
					});
				}
			}
		} catch (error) {
			console.error('Error handling drop:', error);
		}
	}
</script>

<div class="relative h-full w-full">
	<FunctorDialog {fid} bind:open {onSave}></FunctorDialog>
	<!-- <PanelManage view={rid} store={myPanelStore}></PanelManage> -->
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
