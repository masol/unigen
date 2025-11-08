<script lang="ts">
	import IconDatabase from '~icons/mdi/database';
	import IconDiagram from '~icons/carbon/flow';
	import IconDataProcessor from '~icons/carbon/data-enrichment';
	import { densityConfig, type NavItem } from './type';
	import {
		ENTITIES,
		navStore,
		TRANSFORM,
		WORKFLOW,
		type NavType
	} from '$lib/stores/navpanel/nav.svelte';
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
	import { localeStore, t } from '$lib/stores/config/ipc/i18n.svelte';

	const config = densityConfig['comfortable'];
	const topItems: NavItem[] = [
		{ id: ENTITIES, icon: IconDatabase, label: 'Entities' },
		{ id: TRANSFORM, icon: IconDataProcessor, label: 'Transformer' },
		{ id: WORKFLOW, icon: IconDiagram, label: 'Workflow' }
	];
	let selectedNav = $derived(navStore.current);

	// isTop指示是否从上部导航区的item发出的事件.
	function handleItemClick(item: NavItem) {
		navStore.setCurnav(item.id as NavType);
	}

	function handleKeyDown(event: KeyboardEvent, item: NavItem) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleItemClick(item);
		}
	}
</script>

<div class="flex flex-col items-center {config.gap}">
	{#each topItems as item (item.id)}
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
	{/each}
</div>
