<!-- src/lib/components/EntityListItem.svelte -->
<script lang="ts">
	import IconCircle from '~icons/mdi/circle-outline';
	import IconCircleFilled from '~icons/mdi/circle';
	import IconFlowchart from '~icons/mdi/chart-timeline-variant';
	import type { FlowData } from '$lib/utils/vocab/type';
	import { viewStore, type ViewType } from '$lib/stores/project/view.svelte';
	import {
		flowStore,
		getViewIdOfFlow,
	} from '$lib/stores/project/flow.svelte';
	import { navStore } from '$lib/stores/navpanel/nav.svelte';

	const viewedFlows = $derived.by(() => {
		if (navStore.filter)
			return flowStore.items.filter((item) => (item.word ?? '').includes(navStore.filter));
		return flowStore.items;
	});

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
</script>

<div class="space-y-0.5">
	{#each viewedFlows as flow (flow.id)}
		{@const state = getItemState(flow.id)}

		<button
			type="button"
			onclick={() => handleItemClick(flow)}
			class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm
                   font-medium transition-all duration-200
                   {state === 'focused'
				? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
				: state === 'opened'
					? 'bg-primary-50 text-primary-900 hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-100 dark:hover:bg-primary-900/30'
					: 'text-surface-700 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-700/50'}
                   hover:scale-[1.01] active:scale-[0.99]"
		>
			<!-- 类型图标 -->
			<div
				class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-all duration-200
                       {state === 'focused'
					? 'bg-white/20'
					: state === 'opened'
						? 'bg-primary-100 dark:bg-primary-800/30'
						: 'bg-surface-100 dark:bg-surface-700'}"
			>
				<IconFlowchart
					class="h-4 w-4
                           {state === 'focused'
						? 'text-white'
						: state === 'opened'
							? 'text-primary-600 dark:text-primary-400'
							: 'text-surface-500 dark:text-surface-400'}"
				/>
			</div>

			<!-- 实体名称和子项名称 -->
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
					<div class="h-2 w-2 rounded-full bg-surface-300 opacity-40 dark:bg-surface-500"></div>
				{/if}
			</div>
		</button>
	{/each}
</div>
