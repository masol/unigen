<script lang="ts">
	import {
		navStore,
		ENTITIES,
		TRANSFORM,
		WORKFLOW,
		FLOWCHART,
		UI
	} from '$lib/stores/navpanel/nav.svelte';
	import EntityComp from './entities/main.svelte';
	import FlowChart from './flowchart/main.svelte';

	let currentNav = $derived(navStore.current);
	let scrollY = $state(0);
	function handleScroll(e: Event) {
		scrollY = (e.target as HTMLElement).scrollTop;
	}

	const navList = $state([
		{
			id: ENTITIES
		},
		{
			id: TRANSFORM
		},
		{
			id: WORKFLOW
		},
		{
			id: FLOWCHART
		},
		{
			id: UI
		}
	]);
</script>

<!-- <div class="p-4">
					<h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100">Left Panel</h2>
					<p class="mt-2 text-sm text-surface-600 dark:text-surface-400">
						Additional content goes here
					</p>
				</div> -->

<div
	class="flex h-full flex-col border-r border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900"
>
	<!-- 顶部标题栏（sticky） -->
	<!-- <header
		class="sticky top-0 z-10 border-b border-surface-200 bg-white/95 backdrop-blur-sm transition-all duration-200 dark:border-surface-700 dark:bg-surface-800/95"
		class:shadow-lg={scrollY > 10}
		class:border-surface-300={scrollY > 10}
	>
		<div class="mx-auto flex h-11 max-w-full items-center justify-between">
			<input class="w-full" />
			<div class="flex-1">
				{#if hasChanges}
					<div class="flex gap-2" transition:fade={{ duration: 200 }}>
						<button
							class="variant-ghost-surface hover:variant-soft-surface btn flex items-center gap-1.5 btn-sm"
							aria-label="取消更改"
						>
							<IconUndo class="text-lg" />
							<span class="hidden sm:inline">取消</span>
						</button>
					</div>
				{/if}
			</div>

			<h1 class="text-xl font-semibold text-surface-900 dark:text-surface-50">设置</h1>

			<div class="flex flex-1 justify-end">
				{#if hasChanges}
					<div transition:fade={{ duration: 200 }}>
						<button
							class="variant-filled-primary btn flex items-center gap-1.5 btn-sm shadow-sm hover:shadow-md"
							aria-label="保存更改"
						>
							<IconSave class="text-lg" />
							<span class="hidden sm:inline">保存更改</span>
						</button>
					</div>
				{/if}
			</div>
		</div>
	</header> -->

	<!-- 主内容区域 -->
	<div class="flex min-h-0 flex-1">
		<!-- 左侧树形导航 -->
		{#each navList as nav (nav.id)}
			<div
				id={`nav-${nav.id}`}
				role="tabpanel"
				aria-labelledby={`nav-${nav.id}`}
				tabindex={currentNav === nav.id ? 0 : -1}
				class="relative h-full w-full overflow-auto"
				style:display={currentNav === nav.id ? 'block' : 'none'}
			>
				{nav.id}
				<!-- 动态组件渲染 - 使用导入的组件 -->
				{#if nav.id === ENTITIES}
					<EntityComp></EntityComp>
				{:else if nav.id === FLOWCHART}
					<FlowChart></FlowChart>
				{:else if nav.id === WORKFLOW}
					<!-- <OpenView /> -->
				{:else if nav.id === TRANSFORM}
					<!-- <SettingView /> -->
				{/if}
			</div>
		{/each}
	</div>
</div>
