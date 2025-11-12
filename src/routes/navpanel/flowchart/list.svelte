<script lang="ts">
	import IconCircle from '~icons/mdi/circle-outline';
	import IconCircleFilled from '~icons/mdi/circle';
	import IconFlowchart from '~icons/mdi/chart-timeline-variant';
	import IconDragVertical from '~icons/mdi/drag-vertical';
	import type { FlowData } from '$lib/utils/vocab/type';
	import { viewStore, type ViewType } from '$lib/stores/project/view.svelte';
	import { flowStore, getViewIdOfFlow } from '$lib/stores/project/flow.svelte';
	import { navStore } from '$lib/stores/navpanel/nav.svelte';

	const viewedFlows = $derived(
		navStore.filter
			? flowStore.items.filter((item) => (item.word ?? '').includes(navStore.filter))
			: flowStore.items
	);

	let draggedFlow = $state<FlowData | null>(null);
	let dragOverIndex = $state<number | null>(null);

	function handleItemClick(flow: FlowData) {
		const viewId = getViewIdOfFlow(flow.id);
		const viewDef = {
			id: viewId,
			label: `${flow.word}`,
			closable: true,
			type: 'flow' as ViewType
		};
		viewStore.addView(viewDef);
	}

	function getItemState(id: number): 'focused' | 'opened' | 'closed' {
		const docId = getViewIdOfFlow(id);
		if (viewStore.currentView?.id === docId) {
			return 'focused';
		}
		if (viewStore.tabs.some((tab) => tab.id === docId)) {
			return 'opened';
		}
		return 'closed';
	}

	// 拖拽开始
	function handleDragStart(e: DragEvent, flow: FlowData) {
		draggedFlow = flow;
		console.log('handleDragStart=', e);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('application/json', JSON.stringify(flow));
			// 可选：设置拖拽时的图像
			// e.dataTransfer.setDragImage(e.currentTarget as Element, 0, 0);
		}
	}

	// 拖拽结束
	function handleDragEnd(e: DragEvent) {
		console.log('handleDragEnd=', e);

		draggedFlow = null;
		dragOverIndex = null;
	}

	// 拖拽进入目标区域
	function handleDragEnter(e: DragEvent, index: number) {
		console.log('handleDragEnter=', e);

		e.preventDefault();
		dragOverIndex = index;
	}

	// 在目标区域上方移动
	function handleDragOver(e: DragEvent) {
		console.log('handleDragOver=', e);

		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
	}

	// 离开目标区域
	function handleDragLeave(e: DragEvent, index: number) {
		console.log('handleDragLeave=', e);

		if (dragOverIndex === index) {
			dragOverIndex = null;
		}
	}

	// 放置到目标位置
	function handleDrop(e: DragEvent, targetFlow: FlowData, targetIndex: number) {
		e.preventDefault();
		console.log('handleDrop=', e);

		dragOverIndex = null;

		if (!draggedFlow || draggedFlow.id === targetFlow.id) {
			return;
		}

		// TODO: 在此处实现拖拽排序逻辑
		// 参数说明：
		// - draggedFlow: 被拖拽的项目
		// - targetFlow: 目标位置的项目
		// - targetIndex: 目标位置的索引
		console.log('拖拽排序:', {
			from: draggedFlow,
			to: targetFlow,
			toIndex: targetIndex
		});

		// 示例实现（需要根据实际需求调整）：
		// const fromIndex = viewedFlows.findIndex(f => f.id === draggedFlow.id);
		// flowStore.reorder(fromIndex, targetIndex);
	}
</script>

<div class="space-y-0.5">
	{#each viewedFlows as flow, index (flow.id)}
		{@const state = getItemState(flow.id)}
		{@const isDragging = draggedFlow?.id === flow.id}
		{@const isDragOver = dragOverIndex === index}

		<button
			type="button"
			draggable="true"
			ondragstart={(e) => handleDragStart(e, flow)}
			ondragend={handleDragEnd}
			ondragenter={(e) => handleDragEnter(e, index)}
			ondragover={handleDragOver}
			ondragleave={(e) => handleDragLeave(e, index)}
			ondrop={(e) => handleDrop(e, flow, index)}
			onclick={() => handleItemClick(flow)}
			class="group flex w-full cursor-move items-center gap-3 rounded-lg px-3 py-2
                   text-sm font-medium transition-all duration-200
                   {isDragging ? 'scale-95 opacity-50' : ''}
                   {isDragOver ? 'ring-2 ring-primary-500 ring-offset-2' : ''}
                   {state === 'focused'
				? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
				: state === 'opened'
					? 'bg-primary-50 text-primary-900 hover:bg-primary-100 active:bg-primary-200 dark:bg-primary-900/20 dark:text-primary-100 dark:hover:bg-primary-900/30 dark:active:bg-primary-900/40'
					: 'text-surface-700 hover:bg-surface-200 active:bg-surface-300 dark:text-surface-300 dark:hover:bg-surface-700 dark:active:bg-surface-600'}
                   hover:scale-[1.01] active:scale-[0.99]"
		>
			<!-- 拖拽手柄 -->
			<div
				class="flex h-8 w-5 flex-shrink-0 items-center justify-center opacity-0 transition-opacity duration-200
                       group-hover:opacity-100"
			>
				<IconDragVertical
					class="h-4 w-4
                           {state === 'focused'
						? 'text-white/70'
						: state === 'opened'
							? 'text-primary-400 dark:text-primary-500'
							: 'text-surface-400 dark:text-surface-500'}"
				/>
			</div>

			<!-- 类型图标 -->
			<div
				class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-all duration-200
                       {state === 'focused'
					? 'bg-white/20 group-hover:bg-white/30'
					: state === 'opened'
						? 'bg-primary-100 group-hover:bg-primary-200 dark:bg-primary-800/30 dark:group-hover:bg-primary-800/40'
						: 'bg-surface-100 group-hover:bg-surface-200 dark:bg-surface-700 dark:group-hover:bg-surface-600'}"
			>
				<IconFlowchart
					class="h-4 w-4 transition-transform duration-200 group-hover:scale-110
                           {state === 'focused'
						? 'text-white'
						: state === 'opened'
							? 'text-primary-600 dark:text-primary-400'
							: 'text-surface-500 group-hover:text-surface-600 dark:text-surface-400 dark:group-hover:text-surface-300'}"
				/>
			</div>

			<div class="flex flex-1 flex-col items-start gap-0.5 overflow-hidden">
				<span class="truncate text-left font-semibold">
					{flow.word}
				</span>
			</div>

			<!-- 状态指示器 -->
			<div class="flex h-5 w-5 flex-shrink-0 items-center justify-center">
				{#if state === 'focused'}
					<IconCircleFilled class="h-4 w-4 text-white" />
				{:else if state === 'opened'}
					<IconCircle class="h-4 w-4 text-primary-500 dark:text-primary-400" />
				{:else}
					<div
						class="h-2 w-2 rounded-full bg-surface-400 opacity-50 transition-all duration-200
					            group-hover:h-2.5 group-hover:w-2.5 group-hover:opacity-70
					            dark:bg-surface-500"
					></div>
				{/if}
			</div>
		</button>
	{/each}
</div>
