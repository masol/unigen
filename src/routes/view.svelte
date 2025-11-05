<script lang="ts">
	import IconPlus from '~icons/lucide/plus';
	import IconX from '~icons/lucide/x';
	import IconFolder from '~icons/lucide/folder';
	import IconFileText from '~icons/lucide/file-text';

	import { projectStore } from '$lib/stores/project/project.svelte';

	// 导入视图组件
	import MainView from './views/main.svelte';
	import OpenView from './views/open.svelte';
	import SettingView from './views/setting/main.svelte';
	import { viewStore } from '$lib/stores/project/view.svelte';

	let currentId = $derived(projectStore.currentId);
	let viewList = $derived(viewStore.tabs);
	let curViewId = $derived(viewStore.activeId);
	// curView ? views.get(curView) : null);
</script>

{#if currentId}
	<div class="flex h-full flex-col bg-surface-50-950">
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
					<button type="button" class="variant-filled-primary btn">
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
						tabindex={curViewId === view.id ? 0 : -1}
						class="absolute inset-0 overflow-auto"
						style:display={curViewId === view.id ? 'block' : 'none'}
					>
						<!-- 动态组件渲染 - 使用导入的组件 -->
						{#if view.type === 'flow'}
							<MainView />
						{:else if view.type === 'prompt'}
							<OpenView />
						{:else if view.type === 'settings'}
							<SettingView />
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
			<OpenView></OpenView>
		</div>
	</div>
{/if}
