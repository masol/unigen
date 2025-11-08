<script lang="ts">
	import IconMdiPlus from '~icons/mdi/plus';
	import IconMdiMagnify from '~icons/mdi/magnify';
	import IconMdiClose from '~icons/mdi/close';
	import { fade } from 'svelte/transition';

	// 假store: 使用Svelte 5 Runes实现跨组件状态管理
	const searchStore = $state({
		value: '',
		isSearching: false,
		results: [] as string[] // 假搜索结果数据
	});

	const createStore = $state({
		isCreating: false
	});

	// 模拟搜索逻辑
	function performSearch(value: string) {
		searchStore.isSearching = true;
		searchStore.results = value ? [`Result for "${value}"`, 'Another result', 'Yet another'] : [];
		// 模拟异步搜索
		setTimeout(() => {
			searchStore.isSearching = false;
		}, 500);
		console.log('Searching for:', value, 'Results:', searchStore.results);
	}

	// Debounced search with timeout management
	let searchTimeoutId: ReturnType<typeof setTimeout> | null = null;

	function debouncedSearch(value: string) {
		if (searchTimeoutId) clearTimeout(searchTimeoutId);
		searchTimeoutId = setTimeout(() => performSearch(value), 300);
	}

	function handleCreate() {
		createStore.isCreating = true;
		console.log('Create clicked');
		// 模拟创建过程
		setTimeout(() => {
			createStore.isCreating = false;
		}, 1000);
	}

	function clearSearch() {
		searchStore.value = '';
		searchStore.results = [];
	}

	// Effect to handle search changes
	$effect(() => {
		debouncedSearch(searchStore.value);
		return () => {
			if (searchTimeoutId) clearTimeout(searchTimeoutId);
		};
	});

	// 键盘支持：Enter键触发搜索，Escape键清除
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			performSearch(searchStore.value);
		} else if (event.key === 'Escape') {
			clearSearch();
		}
	}
</script>

<!-- 整体容器，紧凑设计适合titlebar，添加阴影和微动画提升视觉层次 -->
<div
	class="
		rounded-token
		ring-surface-300-600-token
		flex
		w-full
		max-w-md
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
	<!-- Create button: 添加loading状态和tooltip -->
	<button
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
			<!-- 加载动画 -->
			<div
				class="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
			></div>
		{:else}
			<IconMdiPlus class="h-5 w-5" />
		{/if}
	</button>

	<!-- 分隔线：使用渐变提升视觉 -->
	<div
		class="from-surface-300-600-token h-5 w-px flex-shrink-0 bg-gradient-to-b to-transparent"
	></div>

	<!-- Search input: 添加焦点状态和动画 -->
	<div class="relative flex min-w-0 flex-1 items-center">
		<IconMdiMagnify
			class="text-surface-500-400-token pointer-events-none absolute left-2.5 h-4 w-4 transition-colors duration-200"
		/>
		<input
			type="text"
			bind:value={searchStore.value}
			placeholder="搜索..."
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
		{#if searchStore.value}
			<!-- 清除按钮：添加淡入动画 -->
			<button
				type="button"
				onclick={clearSearch}
				aria-label="清除搜索"
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
		{#if searchStore.isSearching}
			<!-- 搜索加载指示器 -->
			<div class="absolute right-10 h-4 w-4 animate-pulse">
				<div class="h-1 w-1 rounded-full bg-primary-500"></div>
			</div>
		{/if}
	</div>
</div>

<!-- 搜索结果下拉：紧凑设计，适合titlebar上下文 -->
{#if searchStore.results.length > 0}
	<div
		class="bg-surface-50-900-token border-surface-200-700-token rounded-token absolute top-full z-50 mt-1 max-h-40 w-full max-w-md overflow-y-auto border shadow-lg"
		transition:fade={{ duration: 200 }}
	>
		{#each searchStore.results as result, i}
			<button
				class="hover:bg-surface-hover-token first:rounded-t-token last:rounded-b-token w-full px-3 py-2 text-left text-sm transition-colors duration-150"
				onclick={() => console.log('Selected:', result)}
			>
				{result}
			</button>
		{/each}
	</div>
{/if}
