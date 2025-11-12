<script lang="ts">
	import IconCircle from '~icons/mdi/circle-outline';
	import IconCircleFilled from '~icons/mdi/circle';
	import IconFunction from '~icons/mdi/function-variant';
	import type { FunctorData } from '$lib/utils/vocab/type';
	import { viewStore, type ViewType } from '$lib/stores/project/view.svelte';
	import { navStore } from '$lib/stores/navpanel/nav.svelte';
	import { functorStore, getViewIdOfFunctor } from '$lib/stores/project/functor.svelte';

	// 原始数据（只读）
	const viewedFunctors = $derived(
		navStore.filter
			? functorStore.items.filter((item) => (item.word ?? '').includes(navStore.filter))
			: functorStore.items
	);

	function handleItemClick(item: FunctorData) {
		const viewId = getViewIdOfFunctor(item.id);
		const viewDef = {
			id: viewId,
			label: `${item.word}`,
			closable: true,
			type: 'function' as ViewType
		};
		viewStore.addView(viewDef);
	}

	function getItemState(id: number): 'focused' | 'opened' | 'closed' {
		const docId = getViewIdOfFunctor(id);
		if (viewStore.currentView?.id === docId) {
			return 'focused';
		}
		if (viewStore.tabs.some((tab) => tab.id === docId)) {
			return 'opened';
		}
		return 'closed';
	}

	// 拖拽开始处理
	function handleDragStart(e: DragEvent, functor: FunctorData) {
		if (!e.dataTransfer) return;

		// 设置拖拽数据
		e.dataTransfer.effectAllowed = 'copy';
		e.dataTransfer.setData(
			'application/json',
			JSON.stringify({
				type: 'functor',
				id: functor.id,
				word: functor.word
			})
		);
		e.dataTransfer.setData('text/plain', functor.word || '');
	}

	// 拖拽经过处理 - 显示禁止效果
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) {
			// 检查是否是自己拖出的 functor
			const data = e.dataTransfer.types.includes('application/json');
			if (data) {
				e.dataTransfer.dropEffect = 'none'; // 显示禁止图标
			}
		}
	}
</script>

<div class="space-y-0.5" role="list" ondragover={handleDragOver}>
	{#each viewedFunctors as functor (functor.id)}
		{@const state = getItemState(functor.id)}

		<button
			type="button"
			draggable="true"
			ondragstart={(e) => handleDragStart(e, functor)}
			onclick={(e) => {
				if (!e.defaultPrevented) {
					handleItemClick(functor);
				}
			}}
			data-functor-id={functor.id}
			data-functor-word={functor.word}
			class="group flex w-full cursor-grab items-center gap-3 rounded-lg px-3 py-2
                   text-sm font-medium transition-all duration-200 active:cursor-grabbing
                   {state === 'focused'
				? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
				: state === 'opened'
					? 'bg-primary-50 text-primary-900 hover:bg-primary-100 active:bg-primary-200 dark:bg-primary-900/20 dark:text-primary-100 dark:hover:bg-primary-900/30 dark:active:bg-primary-900/40'
					: 'text-surface-700 hover:bg-surface-200 active:bg-surface-300 dark:text-surface-300 dark:hover:bg-surface-700 dark:active:bg-surface-600'}
                   hover:scale-[1.01] active:scale-[0.99]"
		>
			<div
				class="pointer-events-none flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-all duration-200
                       {state === 'focused'
					? 'bg-white/20 group-hover:bg-white/30'
					: state === 'opened'
						? 'bg-primary-100 group-hover:bg-primary-200 dark:bg-primary-800/30 dark:group-hover:bg-primary-800/40'
						: 'bg-surface-100 group-hover:bg-surface-200 dark:bg-surface-700 dark:group-hover:bg-surface-600'}"
			>
				<IconFunction
					class="h-4 w-4 transition-transform duration-200 group-hover:scale-110
                           {state === 'focused'
						? 'text-white'
						: state === 'opened'
							? 'text-primary-600 dark:text-primary-400'
							: 'text-surface-500 group-hover:text-surface-600 dark:text-surface-400 dark:group-hover:text-surface-300'}"
				/>
			</div>

			<div class="pointer-events-none flex flex-1 flex-col items-start gap-0.5 overflow-hidden">
				<span class="truncate text-left font-semibold">
					{functor.word}
				</span>
			</div>

			<div class="pointer-events-none flex h-5 w-5 flex-shrink-0 items-center justify-center">
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
