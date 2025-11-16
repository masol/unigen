<script lang="ts">
	import IconWorkflow from '~icons/mdi/workflow';
	import IconTable from '~icons/mdi/table';
	import IconFunction from '~icons/mdi/function-variant';
	import IconFlowchart from '~icons/mdi/chart-timeline-variant';
	import IconUI from '~icons/mdi/view-dashboard';
	import { densityConfig, type NavItem } from './type';
	import {
		navStore,
		WORKFLOW,
		UI,
		type NavType
	} from '$lib/stores/navpanel/nav.svelte';
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
	import { localeStore, t } from '$lib/stores/config/ipc/i18n.svelte';
	import { TypeEntity, TypeFlow, TypeFunctor } from '$lib/utils/vocab/type';

	const config = densityConfig['comfortable'];
	const topItems: NavItem[] = [
		{ id: TypeFlow, icon: IconFlowchart, label: TypeFlow, disabled: false },
		{ id: TypeFunctor, icon: IconFunction, label: TypeFunctor, disabled: false },
		{ id: TypeEntity, icon: IconTable, label: TypeEntity, disabled: false },
		{ id: 'sep::1', icon: null, label: 'sep', disabled: false }, // 分隔符
		{ id: WORKFLOW, icon: IconWorkflow, label: WORKFLOW, disabled: true },
		{ id: UI, icon: IconUI, label: UI, disabled: true }
	];

	let selectedNav = $derived(navStore.current);

	// 判断是否为分隔符项
	function isSeparator(item: NavItem): boolean {
		return item.id.startsWith('sep::') || item.label === 'sep';
	}

	function handleItemClick(item: NavItem) {
		if (isSeparator(item)) return; // 分隔符不可点击
		navStore.setCurnav(item.id as NavType);
	}

	function handleKeyDown(event: KeyboardEvent, item: NavItem) {
		if (isSeparator(item)) return; // 分隔符不响应键盘事件
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleItemClick(item);
		}
	}
</script>

<div class="flex flex-col items-center {config.gap}">
	{#each topItems as item (item.id)}
		{#if isSeparator(item)}
			<!-- 分隔符 -->
			<div class="w-full px-2 py-1">
				<div class="h-px bg-surface-300-700"></div>
			</div>
		{:else}
			{@const IconComponent = item.icon}
			{@const isActive = item.id === selectedNav}

			<div class="relative flex w-full items-center justify-center">
				<!-- Active indicator bar -->
				<div
					class="
						absolute left-0 h-full w-0.5
						transition-all duration-200
						{isActive ? 'bg-primary-500 opacity-100' : 'opacity-0'}
					"
				></div>

				<Tooltip openDelay={1200} closeDelay={0} positioning={{ placement: 'right', gutter: 8 }}>
					<Tooltip.Trigger
						type="button"
						disabled={item.disabled}
						class="
							flex items-center justify-center
							{config.itemSize}
							rounded-token
							transition-all duration-200
							focus-visible:ring-2
							focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100-900 focus-visible:outline-none
							{isActive
							? 'bg-primary-500/10 text-primary-500'
							: 'text-surface-700-300 hover:bg-surface-200-800 hover:text-surface-900-100 active:bg-surface-300-700'}
						"
						onclick={() => handleItemClick(item)}
						onkeydown={(e) => handleKeyDown(e, item)}
						aria-label={item.label}
						aria-current={isActive ? 'page' : undefined}
					>
						<IconComponent class="h-5 w-5" aria-hidden="true" />
					</Tooltip.Trigger>

					<Portal>
						<Tooltip.Positioner style="z-index: 50;">
							<Tooltip.Content
								class="
									rounded-token
									bg-surface-900-100
									px-3 py-1.5
									text-sm font-medium
									whitespace-nowrap text-surface-100-900
									shadow-xl
								"
							>
								{#key localeStore.lang}
									{t(item.label)}
								{/key}
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>
		{/if}
	{/each}
</div>
