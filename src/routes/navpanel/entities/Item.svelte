<!-- src/lib/components/EntityListItem.svelte -->
<script lang="ts">
	import IconDatabase from '~icons/mdi/database';
	import IconChevronRight from '~icons/mdi/chevron-right';
	import IconCircle from '~icons/mdi/circle-outline';
	import IconCircleFilled from '~icons/mdi/circle';
	import IconText from '~icons/mdi/text-box';
	import IconFunction from '~icons/mdi/function-variant';
	import IconLink from '~icons/mdi/link-variant';
	import IconFileDocument from '~icons/mdi/file-document';
	import IconPuzzle from '~icons/mdi/puzzle';

	import { entityStore, getViewIdPrefix } from '$lib/stores/project/entity.svelte';
	// import { entityViewStore, type SubItemType } from '$lib/stores/navpanel/entityview.svelte';
	import type { EntityData } from '$lib/utils/vocab/type';
	import { viewStore, type ViewType } from '$lib/stores/project/view.svelte';

	let { entity }: { entity: EntityData } = $props();

	const isExpanded = $derived(entity.expand);
	const hasOpenedTabs = $derived(
		viewStore.tabs.some((tab) => {
			return tab.id && tab.id.startsWith(getViewIdPrefix(entity.id));
		})
	);

	type SubItemType = { id: string; name: string; icon: any };

	const fixedSubItems: Array<SubItemType> = [
		{ id: 'general', name: '定义', icon: IconFileDocument },
		// { id: 'compose', name: '组成', icon: IconPuzzle },
		{ id: 'functions', name: '评估函数', icon: IconFunction },
		{ id: 'relations', name: '约束与规则', icon: IconLink }
	];

	function handleEntityClick() {
		entityStore.toggleExpand(entity.id);
	}

	function getViewId(subItemType: string): string {
		const viewIdPrefix = getViewIdPrefix(entity.id);
		const viewId = `${viewIdPrefix}${subItemType}`;
		return viewId;
	}

	function handleSubItemClick(subItem: SubItemType) {
		const viewId = getViewId(subItem.id);
		const viewDef = {
			id: viewId,
			label: `${entity.word}(${subItem.name})`,
			closable: true,
			type: `ent${subItem.id}` as ViewType
		};
		viewStore.addView(viewDef);
		// 打开view!.
		console.log('open tab::');
		// entityViewStore.openTab(entity.id, entity.word, subItemType);
	}

	function getSubItemState(subItemType: string): 'focused' | 'opened' | 'closed' {
		const docId = getViewId(subItemType);
		if (viewStore.currentView?.id === docId) {
			return 'focused';
		}
		if (viewStore.tabs.some((tab) => tab.id === docId)) {
			return 'opened';
		}
		return 'closed';
	}
</script>

<div class="space-y-2">
	<!-- 实体头部容器 - 使用固定高度来避免子元素位移 -->
	<div class="relative" style="height: 60px;">
		<!-- 实体头部 - 卡片效果（绝对定位，hover变换不影响布局） -->
		<button
			type="button"
			onclick={handleEntityClick}
			class="group absolute inset-0 flex items-center gap-3 rounded-xl px-4 py-3
		       text-sm font-semibold transition-all duration-300 ease-out
		       {hasOpenedTabs
				? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/40 dark:from-primary-600 dark:to-primary-700 dark:shadow-primary-600/20 dark:hover:shadow-primary-600/40'
				: 'bg-white text-surface-900 shadow-md shadow-surface-900/5 hover:shadow-xl hover:shadow-surface-900/15 dark:bg-surface-800 dark:text-surface-100 dark:shadow-surface-950/20 dark:hover:shadow-surface-950/40'}
		       border {hasOpenedTabs
				? 'border-primary-400/20 dark:border-primary-500/20'
				: 'border-surface-200 dark:border-surface-700'}
		       before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-br before:opacity-0 before:transition-opacity before:duration-300
		       {hasOpenedTabs
				? 'before:from-white/10 before:to-transparent hover:before:opacity-100'
				: 'before:from-primary-50 before:to-transparent hover:before:opacity-100 dark:before:from-surface-700/50'}
		       hover:-translate-y-0.5 hover:scale-[1.02] active:translate-y-0 active:scale-[0.98]"
		>
			<!-- 展开图标 -->
			<IconChevronRight
				class="relative z-10 h-5 w-5 flex-shrink-0 transition-all duration-300
			       {isExpanded ? 'rotate-90' : ''}
			       {hasOpenedTabs
					? 'text-white/90'
					: 'text-surface-500 group-hover:text-primary-600 dark:text-surface-400 dark:group-hover:text-primary-400'}
			       group-hover:scale-110"
			/>

			<!-- 数据库图标 -->
			<div
				class="relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-300
			       {hasOpenedTabs
					? 'bg-white/15 shadow-inner'
					: 'bg-gradient-to-br from-primary-50 to-primary-100/50 group-hover:from-primary-100 group-hover:to-primary-200/50 dark:from-surface-700 dark:to-surface-700/50 dark:group-hover:from-surface-600 dark:group-hover:to-surface-600/50'}
			       group-hover:scale-110 group-hover:rotate-3"
			>
				<IconDatabase
					class="h-5 w-5 transition-all duration-300
				       {hasOpenedTabs ? 'text-white' : 'text-primary-600 dark:text-primary-400'}
				       group-hover:scale-110"
				/>
			</div>

			<!-- 实体名称 -->
			<span
				class="relative z-10 flex-1 truncate text-left transition-all duration-300 group-hover:translate-x-0.5"
			>
				{entity.word}
			</span>

			<!-- 打开的标签数量 -->
			{#if hasOpenedTabs}
				<div
					class="relative z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-white/20 px-2 text-xs font-bold text-white shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:bg-white/30"
				>
					{11}
					<!-- {entityViewStore.getOpenedTabsCount(entity.id)} -->
				</div>
			{/if}
		</button>
	</div>

	<!-- 子元素列表 - 保持原有轻量样式 -->
	{#if isExpanded}
		<div class="relative pl-9">
			<!-- 竖向连接线 -->
			<div
				class="absolute top-0 bottom-0 left-4 w-px
                       {hasOpenedTabs
					? 'bg-primary-200 dark:bg-primary-800/40'
					: 'bg-surface-200 dark:bg-surface-600/40'}"
			></div>

			<div class="space-y-0.5">
				{#each fixedSubItems as subItem (subItem.id)}
					{@const Icon = subItem.icon}
					{@const state = getSubItemState(subItem.id)}

					<div class="relative">
						<!-- 横向连接线 -->
						<div
							class="absolute top-1/2 left-[-20px] h-px w-5
                               {hasOpenedTabs
								? 'bg-primary-200 dark:bg-primary-800/40'
								: 'bg-surface-200 dark:bg-surface-600/40'}"
						></div>

						<button
							type="button"
							onclick={() => handleSubItemClick(subItem)}
							class="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm
                           font-normal transition-all duration-150
                           {state === 'focused'
								? 'bg-primary-500 text-white shadow-sm'
								: state === 'opened'
									? 'bg-primary-50 text-primary-900 hover:bg-primary-100 dark:bg-primary-900/10 dark:text-primary-200 dark:hover:bg-primary-900/20'
									: 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700/50'}"
						>
							<!-- 类型图标 -->
							<Icon
								class="h-3.5 w-3.5 flex-shrink-0
                               {state === 'focused'
									? 'text-white'
									: state === 'opened'
										? 'text-primary-600 dark:text-primary-400'
										: 'text-surface-400 dark:text-surface-500'}"
							/>

							<!-- 名称 -->
							<span class="flex-1 truncate text-left">{subItem.name}</span>

							<!-- 状态指示器 -->
							<div class="flex h-4 w-4 flex-shrink-0 items-center justify-center">
								{#if state === 'focused'}
									<IconCircleFilled class="h-3 w-3 text-white" />
								{:else if state === 'opened'}
									<IconCircle class="h-3 w-3 text-primary-500 dark:text-primary-400" />
								{:else}
									<div class="h-1.5 w-1.5 rounded-full bg-surface-300 dark:bg-surface-600"></div>
								{/if}
							</div>
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
