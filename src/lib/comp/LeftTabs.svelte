<script lang="ts">
	import IconMdiPlus from '~icons/mdi/plus';
	import IconMdiMagnify from '~icons/mdi/magnify';
	import IconMdiClose from '~icons/mdi/close';
	import { fade } from 'svelte/transition';
	import { navStore } from '$lib/stores/navpanel/nav.svelte';
	import NewWord from './sidebar/NewWord.svelte';

	// 假store: 使用Svelte 5 Runes实现跨组件状态管理
	let filterStore = $derived(navStore.filter);

	const createStore = $state({
		isCreating: false
	});

	let isFiltering = $state(false);

	// 模拟过滤逻辑
	function performFilter(value: string) {
		isFiltering = true;
		navStore.setFilter(value);
		// 实际过滤逻辑由下方内容组件监听filterStore.value变化后执行
		setTimeout(() => {
			isFiltering = false;
		}, 300);
		console.log('Filtering with:', value);
	}

	// Debounced filter with timeout management
	let filterTimeoutId: ReturnType<typeof setTimeout> | null = null;

	function debouncedFilter(value: string) {
		if (filterTimeoutId) clearTimeout(filterTimeoutId);
		filterTimeoutId = setTimeout(() => performFilter(value), 300);
	}

	function handleCreate() {
		createStore.isCreating = true;
		console.log('Create clicked');
		setTimeout(() => {
			createStore.isCreating = false;
		}, 1000);
	}

	function clearFilter() {
		navStore.setFilter("");
	}

	// Effect to handle filter changes
	$effect(() => {
		debouncedFilter(filterStore);
		return () => {
			if (filterTimeoutId) clearTimeout(filterTimeoutId);
		};
	});

	// 键盘支持：Escape键清除
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			clearFilter();
		}
	}
</script>

<!-- 整体容器，固定最大宽度，紧凑设计适合titlebar -->
<div
	class="
		rounded-token
		ring-surface-300-600-token
		flex
		w-full
		items-center
		gap-0
		border-l
		border-surface-200
		shadow-sm
		ring-1
		transition-shadow
		duration-200
		hover:shadow-md
		dark:border-surface-700
	"
>
	<!-- Create button -->
	 <NewWord></NewWord>
	<!-- <button
		type="button"
		onclick={handleCreate}
		disabled={createStore.isCreating}
		aria-label="新建"
		class="
			text-surface-600-300-token
			hover:bg-surface-hover-token
			focus-visible:ring-offset-surface-50-900-token
			rounded-l-token
			flex
			h-9
			w-9
			flex-shrink-0
			items-center
			justify-center
			bg-transparent
			transition-all
			duration-200
			hover:scale-105
			hover:text-primary-500
			focus-visible:ring-2
			focus-visible:ring-primary-500
			focus-visible:ring-offset-2
			focus-visible:outline-none
			active:scale-95
			disabled:cursor-not-allowed
			disabled:opacity-50
		"
	>
		{#if createStore.isCreating}
			<div
				class="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
			></div>
		{:else}
			<IconMdiPlus class="h-5 w-5" />
		{/if}
	</button> -->

	<!-- 分隔线 -->
	<div
		class="from-surface-300-600-token h-5 w-px flex-shrink-0 bg-gradient-to-b to-transparent"
	></div>

	<!-- Filter input -->
	<div class="relative flex min-w-0 flex-1 items-center">
		<IconMdiMagnify
			class="text-surface-500-400-token pointer-events-none absolute left-2.5 h-4 w-4 transition-colors duration-200"
		/>
		<input
			type="text"
			bind:value={filterStore}
			placeholder="过滤..."
			onkeydown={handleKeydown}
			class="
				text-surface-900-50-token
				placeholder:text-surface-400-500-token
				focus:bg-surface-hover-token
				rounded-r-token
				h-9
				w-full
				border-none
				bg-transparent
				py-2
				pr-9
				pl-9
				text-sm
				transition-all
				duration-200
				outline-none
				focus:ring-2
				focus:ring-primary-500/20
			"
		/>
		{#if filterStore}
			<button
				type="button"
				onclick={clearFilter}
				aria-label="清除过滤"
				class="
					hover:bg-surface-hover-token
					active:bg-surface-200-700-token
					absolute
					right-1.5
					flex
					h-6
					w-6
					flex-shrink-0
					items-center
					justify-center
					rounded-full
					transition-all
					duration-150
					hover:scale-110
					active:scale-90
				"
				transition:fade={{ duration: 150 }}
			>
				<IconMdiClose class="text-surface-600-300-token h-4 w-4" />
			</button>
		{/if}
		{#if isFiltering}
			<div class="absolute right-10 h-4 w-4 animate-pulse">
				<div class="h-1 w-1 rounded-full bg-primary-500"></div>
			</div>
		{/if}
	</div>
</div>
