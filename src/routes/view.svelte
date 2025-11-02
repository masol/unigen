<script lang="ts">
	import IconPlus from '~icons/lucide/plus';
	import IconX from '~icons/lucide/x';
	import IconFolder from '~icons/lucide/folder';
	import IconFileText from '~icons/lucide/file-text';

	// 导入视图组件
	import MainView from './views/main.svelte';
	import OpenView from './views/open.svelte';
	import { projectStore } from '$lib/stores/project/project.svelte';
	import Open from './views/open.svelte';

	// ==================== 假数据定义 ====================
	let curView = $state<string | null>(null);
	let views = $state<Map<string, ViewConfig>>(new Map());

	// ==================== 类型定义 ====================
	interface ViewConfig {
		id: string;
		title: string;
		componentType: 'detail' | 'timeline' | 'kanban';
		createdAt: number;
	}

    let currentId = $derived(projectStore.currentId);

	// ==================== 派生状态 ====================
	let viewList = $derived(Array.from(views.values()));
	let currentView = $derived(curView ? views.get(curView) : null);

	// ==================== 视图操作方法 ====================
	function createView() {
		const viewId = `view-${Date.now()}`;
		const newView: ViewConfig = {
			id: viewId,
			title: `视图 ${viewList.length + 1}`,
			componentType: 'detail',
			createdAt: Date.now()
		};

		views.set(viewId, newView);
		curView = viewId;
	}

	function deleteView(viewId: string, event: Event) {
		event.stopPropagation();
		views.delete(viewId);

		if (curView === viewId) {
			const remainingViews = Array.from(views.keys());
			curView = remainingViews.length > 0 ? remainingViews[0] : null;
		}

		views = views;
	}

	function switchView(viewId: string) {
		curView = viewId;
	}

	// ==================== 副作用 ====================
	$effect(() => {
		if (currentId) {
			console.log('@TODO: Project changed:', currentId);
		} else {
			views.clear();
			curView = null;
		}
	});
</script>

{#if currentId}
	<div class="flex h-full flex-col bg-surface-50-950">
		<!-- Tab 导航栏 -->
		<div
			class="flex items-center gap-2 border-b border-surface-300-700 bg-surface-100-900 px-4"
			role="tablist"
			aria-label="视图切换"
		>
			<!-- Tab 列表 -->
			<div class="flex flex-1 items-center gap-1 overflow-x-auto py-2">
				{#each viewList as view (view.id)}
					<div class="group relative flex items-center">
						<button
							type="button"
							role="tab"
							aria-selected={curView === view.id}
							aria-controls={`panel-${view.id}`}
							tabindex={curView === view.id ? 0 : -1}
							class="rounded-token flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors"
							class:bg-surface-200-800={curView === view.id}
							class:text-primary-700-300={curView === view.id}
							class:text-surface-600-400={curView !== view.id}
							class:hover:bg-surface-200-800={curView !== view.id}
							onclick={() => switchView(view.id)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									switchView(view.id);
								}
							}}
						>
							<IconFileText class="h-4 w-4" />
							<span>{view.title}</span>
						</button>

						<!-- 删除按钮 - 移到外面 -->
						<button
							type="button"
							aria-label={`删除 ${view.title}`}
							class="ml-1 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-error-500/10 hover:text-error-600 focus:opacity-100"
							onclick={(e) => deleteView(view.id, e)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									deleteView(view.id, e);
								}
							}}
						>
							<IconX class="h-3.5 w-3.5" />
						</button>
					</div>
				{/each}
			</div>

			<!-- 新建视图按钮 -->
			<button
				type="button"
				aria-label="新建视图"
				class="rounded-token p-2 text-surface-600-400 transition-colors hover:bg-surface-200-800 hover:text-primary-700-300 focus:ring-2 focus:ring-primary-500"
				onclick={createView}
			>
				<IconPlus class="h-4 w-4" />
			</button>
		</div>

		<!-- Tab 内容区域 -->
		<div class="relative flex-1 overflow-hidden">
			{#if viewList.length === 0}
				<!-- 空状态 -->
				<div
					class="text-surface-500-400 flex h-full flex-col items-center justify-center gap-4"
					role="status"
					aria-live="polite"
				>
					<IconFolder class="h-16 w-16 opacity-50" />
					<div class="text-center">
						<h3 class="text-lg font-medium text-surface-700-300">暂无视图</h3>
						<p class="mt-1 text-sm">点击上方 "+" 按钮创建新视图</p>
					</div>
					<button type="button" class="variant-filled-primary btn" onclick={createView}>
						<IconPlus class="h-5 w-5" />
						<span>创建视图</span>
					</button>
				</div>
			{:else}
				<!-- 视图容器 -->
				{#each viewList as view (view.id)}
					<div
						id={`panel-${view.id}`}
						role="tabpanel"
						aria-labelledby={`tab-${view.id}`}
						tabindex={curView === view.id ? 0 : -1}
						class="absolute inset-0 overflow-auto"
						style:display={curView === view.id ? 'block' : 'none'}
					>
						<!-- 动态组件渲染 - 使用导入的组件 -->
						{#if view.componentType === 'detail'}
							<MainView/>
						{:else if view.componentType === 'timeline'}
							<OpenView/>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	</div>
{:else}
	<!-- 无项目状态 -->
	<div
		class="flex h-full items-center justify-center bg-surface-50-950"
		role="status"
		aria-live="polite"
	>
		<div class="text-surface-500-400 text-center">
            <Open></Open>
		</div>
	</div>
{/if}
